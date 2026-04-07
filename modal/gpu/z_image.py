import os
import modal

REPO_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_DIR = f"/models/{REPO_ID}"
APP_NAME = "zimage-turbo"

volume = modal.Volume.from_name("models", create_if_missing=True)

# ── app ──────────────────────────────────────────────────────────────────────

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime")
    .pip_install(
        "diffusers==0.37.1",
        "transformers==5.4.0",
        "safetensors==0.7.0",
        "loguru==0.7.3",
        "pillow==12.1.1",
        "accelerate==1.13.0",
        "huggingface_hub==1.6.0",
        "tqdm==4.67.3",
        "sentencepiece==0.2.1",
    )
)


with image.imports():
    import torch
    from diffusers import ZImagePipeline


@app.cls(
    image=image,
    gpu="L40S",
    volumes={"/models": volume})
class Inference:
    @modal.enter()
    def load(self):
        self.pipe = ZImagePipeline.from_pretrained(
            MODEL_DIR,
            torch_dtype=torch.bfloat16,
        ).to("cuda")

    @modal.method()
    def generate(
        self,
        prompt: str,
        height: int = 1024,
        width: int = 1024,
        num_inference_steps: int = 8,
        guidance_scale: float = 0.0,
        seed: int = 42,
    ) -> bytes:
        import io

        result = self.pipe(
            prompt=prompt,
            height=height,
            width=width,
            num_inference_steps=num_inference_steps + 1,
            guidance_scale=guidance_scale,
            generator=torch.Generator("cuda").manual_seed(seed),
        )

        buf = io.BytesIO()
        result.images[0].save(buf, format="PNG")
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

    if os.path.exists(MODEL_DIR) and os.listdir(MODEL_DIR):
        print(f"Model already exists at {MODEL_DIR}, skipping")
        return

    snapshot_download(
        repo_id=REPO_ID,
        local_dir=MODEL_DIR,
        local_dir_use_symlinks=False,
        resume_download=True,
        revision="04cc4abb7c5069926f75c9bfde9ef43d49423021",
    )
    volume.commit()
    print(f"Model downloaded to {MODEL_DIR}")

@model_downloader.local_entrypoint()
def download():
    _download.remote()