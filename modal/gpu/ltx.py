import os
from typing import Optional

import modal

HF_REPO_ID = "Lightricks/LTX-2.3"
GEMMA_REPO_ID = "google/gemma-3-12b-it"
MODEL_DIR = f"/models/{HF_REPO_ID}"
GEMMA_DIR = f"/models/{GEMMA_REPO_ID}"
APP_NAME = "ltx-video"

DISTILLED_CHECKPOINT = f"{MODEL_DIR}/ltx-2.3-22b-distilled.safetensors"
SPATIAL_UPSAMPLER = f"{MODEL_DIR}/ltx-2.3-spatial-upscaler-x2-1.1.safetensors"

DEFAULT_HEIGHT = 704
DEFAULT_WIDTH = 1280
# LTX expects num_frames = 8*K + 1.  241 = 8*30+1 ≈ 10s @ 24fps.
DEFAULT_NUM_FRAMES = 241
DEFAULT_INFERENCE_STEPS = 24
# Layer-streaming: keep 2 transformer layers on GPU at a time.
STREAMING_PREFETCH_COUNT = 2

LTX_FILES = [
    "ltx-2.3-22b-distilled.safetensors",
    "ltx-2.3-spatial-upscaler-x2-1.1.safetensors",
]

_RES_ALIGN = 64


def _align_dim(n: int) -> int:
    n = int(n)
    rounded = (n // _RES_ALIGN) * _RES_ALIGN
    return max(_RES_ALIGN, rounded)


def _align_num_frames(n: int) -> int:
    """LTX video latents use num_frames = 8*K + 1."""
    n = int(n)
    if n < 1:
        return 1
    k = (n - 1) // 8
    return max(1, 8 * k + 1)


volume = modal.Volume.from_name("models", create_if_missing=True)

# -- app ----------------------------------------------------------------------

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12"
    )
    .apt_install("git", "ffmpeg")
    .pip_install(
        "torch~=2.7",
        "torchaudio",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .run_commands(
        "git clone --depth 1 https://github.com/Lightricks/LTX-2.git /opt/ltx2",
        "pip install /opt/ltx2/packages/ltx-core /opt/ltx2/packages/ltx-pipelines",
        "pip install 'transformers==4.57.6'",
    )
    .env({"PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"})
)

with image.imports():
    import gc
    import tempfile
    import torch
    from ltx_core.model.video_vae import (
        SpatialTilingConfig,
        TemporalTilingConfig,
        TilingConfig,
        get_video_chunks_number,
    )
    from ltx_pipelines.distilled import DistilledPipeline
    from ltx_pipelines.utils.args import ImageConditioningInput
    from ltx_pipelines.utils.media_io import encode_video


@app.cls(
    image=image,
    gpu="A100-80GB",
    volumes={"/models": volume},
    timeout=1800,
)
class Inference:
    @modal.enter()
    def load(self):
        # No fp8_cast — it conflicts with layer streaming (doubles per-layer
        # GPU memory during forward because fp8+bf16 copies coexist).
        self.pipeline = DistilledPipeline(
            distilled_checkpoint_path=DISTILLED_CHECKPOINT,
            gemma_root=GEMMA_DIR,
            spatial_upsampler_path=SPATIAL_UPSAMPLER,
            loras=[],
        )

    def _run_distilled(
        self,
        *,
        prompt: str,
        seed: int,
        height: int,
        width: int,
        num_frames: int,
        frame_rate: float,
        images: list,
        enhance_prompt: bool,
        temp_paths: list[str],
    ) -> bytes:
        """Run DistilledPipeline and return MP4 bytes; deletes temp_paths when done."""
        try:
            tiling_config = TilingConfig(
                spatial_config=SpatialTilingConfig(
                    tile_size_in_pixels=256,
                    tile_overlap_in_pixels=32,
                ),
                temporal_config=TemporalTilingConfig(
                    tile_size_in_frames=32,
                    tile_overlap_in_frames=8,
                ),
            )

            video, audio = self.pipeline(
                prompt=prompt,
                seed=seed,
                height=height,
                width=width,
                num_frames=num_frames,
                frame_rate=frame_rate,
                images=images,
                tiling_config=tiling_config,
                enhance_prompt=enhance_prompt,
                streaming_prefetch_count=STREAMING_PREFETCH_COUNT,
            )

            video_chunks_number = get_video_chunks_number(num_frames, tiling_config)

            gc.collect()
            torch.cuda.empty_cache()

            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                output_path = f.name

            encode_video(
                video=video,
                fps=int(frame_rate),
                audio=audio,
                output_path=output_path,
                video_chunks_number=video_chunks_number,
            )

            with open(output_path, "rb") as f:
                result = f.read()

            os.unlink(output_path)
            return result
        finally:
            for p in temp_paths:
                try:
                    if p and os.path.exists(p):
                        os.unlink(p)
                except OSError:
                    pass

    @modal.method()
    def generate(
        self,
        prompt: str,
        negative_prompt: str = "",
        seed: int = 42,
        height: int = DEFAULT_HEIGHT,
        width: int = DEFAULT_WIDTH,
        num_frames: int = DEFAULT_NUM_FRAMES,
        frame_rate: float = 24.0,
        num_inference_steps: int = DEFAULT_INFERENCE_STEPS,
        enhance_prompt: bool = False,
        cfg_scale: float = 3.0,
        stg_scale: float = 1.0,
        image: Optional[bytes] = None,
        # 首尾帧：与 image 同时传入时，image 为首帧、end_image 为尾帧（沿用本方法名，避免线上缺 method）
        end_image: Optional[bytes] = None,
        image_frame_idx: int = 0,
        image_strength: float = 1.0,
    ) -> bytes:
        with torch.inference_mode():
            height = _align_dim(height)
            width = _align_dim(width)
            num_frames = _align_num_frames(num_frames)

            _ = (negative_prompt, num_inference_steps, cfg_scale, stg_scale)

            images = []
            temp_paths: list[str] = []

            if end_image is not None:
                if image is None:
                    raise ValueError(
                        "end_image requires image (start frame) to be set"
                    )
                last_frame_idx = max(0, num_frames - 1)
                tmp_start = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                tmp_start.write(image)
                tmp_start.close()
                tmp_end = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                tmp_end.write(end_image)
                tmp_end.close()
                temp_paths = [tmp_start.name, tmp_end.name]
                images = [
                    ImageConditioningInput(
                        tmp_start.name, 0, image_strength
                    ),
                    ImageConditioningInput(
                        tmp_end.name, last_frame_idx, image_strength
                    ),
                ]
            elif image is not None:
                tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                tmp.write(image)
                tmp.close()
                temp_paths.append(tmp.name)
                images.append(
                    ImageConditioningInput(
                        tmp.name, image_frame_idx, image_strength
                    )
                )

            return self._run_distilled(
                prompt=prompt,
                seed=seed,
                height=height,
                width=width,
                num_frames=num_frames,
                frame_rate=frame_rate,
                images=images,
                enhance_prompt=enhance_prompt,
                temp_paths=temp_paths,
            )


# -- model_downloader ---------------------------------------------------------

model_downloader = modal.App("model_downloader")


@model_downloader.function(
    image=modal.Image.debian_slim(python_version="3.12").pip_install(
        "huggingface_hub>=0.34.0,<1.0"
    ),
    volumes={"/models": volume},
    timeout=7200,
    secrets=[modal.Secret.from_name("huggingface")],
)
def _download():
    import os
    from huggingface_hub import hf_hub_download, snapshot_download

    token = os.environ.get("HF_TOKEN")

    for filename in LTX_FILES:
        dest = os.path.join(MODEL_DIR, filename)
        if os.path.exists(dest) and os.path.getsize(dest) > 1000:
            print(f"Already exists: {dest}")
            continue
        print(f"Downloading {HF_REPO_ID}/{filename} ...")
        hf_hub_download(
            repo_id=HF_REPO_ID,
            filename=filename,
            local_dir=MODEL_DIR,
            local_dir_use_symlinks=False,
            token=token,
        )
        print(f"Done: {dest}")

    gemma_marker = os.path.join(GEMMA_DIR, "config.json")
    if os.path.exists(gemma_marker):
        print(f"Gemma model already exists at {GEMMA_DIR}")
    else:
        print(f"Downloading {GEMMA_REPO_ID} ...")
        snapshot_download(
            repo_id=GEMMA_REPO_ID,
            local_dir=GEMMA_DIR,
            local_dir_use_symlinks=False,
            token=token,
        )
        print(f"Done: {GEMMA_DIR}")

    volume.commit()


@model_downloader.local_entrypoint()
def download():
    _download.remote()
