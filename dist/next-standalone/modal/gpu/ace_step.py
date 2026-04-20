import modal

REPO_URL = "https://github.com/ACE-Step/ACE-Step-1.5.git"
REPO_DIR = "/app/ACE-Step-1.5"
DIT_REPO_ID = "ACE-Step/acestep-v15-xl-base"
DIT_MODEL_DIR = f"/models/{DIT_REPO_ID}"
LM_REPO_ID = "ACE-Step/acestep-5Hz-lm-4B"
LM_MODEL_DIR = f"/models/{LM_REPO_ID}"
APP_NAME = "ace-step"

volume = modal.Volume.from_name("models", create_if_missing=True)

# ── app ──────────────────────────────────────────────────────────────────────

app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "libsndfile1")
    .run_commands(
        f"git clone {REPO_URL} {REPO_DIR}",
        f"pip install --no-deps -e {REPO_DIR}/acestep/third_parts/nano-vllm",
        f"grep -viE '^(flash-attn|triton)' {REPO_DIR}/requirements.txt | pip install -r /dev/stdin",
        f"pip install -e {REPO_DIR} --no-deps",
    )
)

with image.imports():
    import io
    import os
    from typing import Optional
    import torch
    import soundfile as sf
    from acestep.handler import AceStepHandler
    from acestep.llm_inference import LLMHandler
    from acestep.inference import generate_music, GenerationParams, GenerationConfig


@app.cls(
    image=image,
    gpu="L40S",
    volumes={"/models": volume},
    timeout=600,
)
class Inference:
    @modal.enter()
    def load(self):
        # Symlink volume models into the repo's checkpoints dir
        ckpt_dir = os.path.join(REPO_DIR, "checkpoints")
        if os.path.exists(ckpt_dir):
            os.remove(ckpt_dir) if os.path.islink(ckpt_dir) else None
        os.symlink(DIT_MODEL_DIR, ckpt_dir)

        self.dit_handler = AceStepHandler()
        self.dit_handler.initialize_service(
            project_root=REPO_DIR,
            config_path="acestep-v15-xl-base",
            device="cuda",
        )
        self.llm_handler = LLMHandler()
        self.llm_handler.initialize(
            checkpoint_dir="/models",
            lm_model_path=LM_REPO_ID,
            backend="vllm",
            device="cuda",
        )

    @modal.method()
    def generate(
        self,
        lyrics: str = "",
        tags: str = "",
        duration: float = 30.0,
        bpm: Optional[int] = None,
        keyscale: str = "",
        language: str = "zh",
        seed: int = -1,
    ) -> bytes:
        params = GenerationParams(
            lyrics=lyrics,
            caption=tags,
            duration=duration,
            bpm=bpm,
            keyscale=keyscale,
            vocal_language=language,
            seed=seed,
        )
        config = GenerationConfig(batch_size=1)
        result = generate_music(self.dit_handler, self.llm_handler, params, config)

        if not result.success or not result.audios:
            raise RuntimeError(result.error or result.status_message)

        audio = result.audios[0]
        tensor = audio["tensor"]  # [channels, samples]
        sr = audio["sample_rate"]

        buf = io.BytesIO()
        sf.write(buf, tensor.cpu().numpy().T, sr, format="FLAC")
        return buf.getvalue()


# ── model_downloader ─────────────────────────────────────────────────────────

model_downloader = modal.App("model_downloader")


@model_downloader.function(
    image=modal.Image.debian_slim(python_version="3.11").pip_install(
        "huggingface_hub==1.6.0"
    ),
    volumes={"/models": volume},
    timeout=1800,
)
def _download():
    import os
    from huggingface_hub import snapshot_download

    for repo_id, model_dir in [(DIT_REPO_ID, DIT_MODEL_DIR), (LM_REPO_ID, LM_MODEL_DIR)]:
        if os.path.exists(model_dir) and os.listdir(model_dir):
            print(f"Model already exists at {model_dir}, skipping")
            continue
        snapshot_download(
            repo_id=repo_id,
            local_dir=model_dir,
            local_dir_use_symlinks=False,
            resume_download=True,
        )
        print(f"Model downloaded to {model_dir}")

    volume.commit()


@model_downloader.local_entrypoint()
def download():
    _download.remote()
