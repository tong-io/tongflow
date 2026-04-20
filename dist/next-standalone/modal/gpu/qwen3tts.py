import modal

DESIGN_REPO_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
CUSTOM_REPO_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
BASE_REPO_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
DESIGN_MODEL_DIR = f"/models/{DESIGN_REPO_ID}"
CUSTOM_MODEL_DIR = f"/models/{CUSTOM_REPO_ID}"
BASE_MODEL_DIR = f"/models/{BASE_REPO_ID}"
APP_NAME = "qwen3-tts"

volume = modal.Volume.from_name("models", create_if_missing=True)

# ── app ──────────────────────────────────────────────────────────────────────

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("pytorch/pytorch:2.5.1-cuda12.4-cudnn9-devel")
    .apt_install("sox", "libsox-dev")
    .pip_install(
        "qwen-tts==0.1.1",
        "transformers==4.57.3",
        "accelerate==1.12.0",
        "soundfile==0.13.1",
        "librosa==0.10.2.post1",
        "torchaudio",
        "onnxruntime==1.22.0",
        "einops==0.8.1",
        "huggingface_hub>=0.34.0,<1.0",
        "flash-attn>=2.5.0",
    )
)

with image.imports():
    import io
    import torch
    import soundfile as sf
    from qwen_tts import Qwen3TTSModel


@app.cls(
    image=image,
    gpu="L4",
    volumes={"/models": volume},
)
class Design:
    @modal.enter()
    def load(self):
        self.tts = Qwen3TTSModel.from_pretrained(
            DESIGN_MODEL_DIR,
            device_map="cuda:0",
            dtype=torch.bfloat16,
            attn_implementation="flash_attention_2",
        )

    @modal.method()
    def generate(
        self,
        text: str,
        language: str = "Chinese",
        instruct: str = "",
        max_new_tokens: int = 2048,
    ) -> bytes:
        wavs, sr = self.tts.generate_voice_design(
            text=text,
            language=language,
            instruct=instruct,
            max_new_tokens=max_new_tokens,
        )
        buf = io.BytesIO()
        sf.write(buf, wavs[0], sr, format="WAV")
        return buf.getvalue()


@app.cls(
    image=image,
    gpu="L4",
    volumes={"/models": volume},
)
class Custom:
    @modal.enter()
    def load(self):
        self.tts = Qwen3TTSModel.from_pretrained(
            CUSTOM_MODEL_DIR,
            device_map="cuda:0",
            dtype=torch.bfloat16,
            attn_implementation="flash_attention_2",
        )

    @modal.method()
    def generate(
        self,
        text: str,
        language: str = "Chinese",
        speaker: str = "Vivian",
        instruct: str = "",
        max_new_tokens: int = 2048,
    ) -> bytes:
        wavs, sr = self.tts.generate_custom_voice(
            text=text,
            language=language,
            speaker=speaker,
            instruct=instruct,
            max_new_tokens=max_new_tokens,
        )
        buf = io.BytesIO()
        sf.write(buf, wavs[0], sr, format="WAV")
        return buf.getvalue()


@app.cls(
    image=image,
    gpu="L4",
    volumes={"/models": volume},
)
class Reference:
    @modal.enter()
    def load(self):
        self.tts = Qwen3TTSModel.from_pretrained(
            BASE_MODEL_DIR,
            device_map="cuda:0",
            dtype=torch.bfloat16,
            attn_implementation="flash_attention_2",
        )

    @modal.method()
    def generate(
        self,
        text: str,
        ref_audio: str,
        ref_text: str = "",
        language: str = "Auto",
        x_vector_only: bool = False,
        max_new_tokens: int = 2048,
    ) -> bytes:
        wavs, sr = self.tts.generate_voice_clone(
            text=text,
            language=language,
            ref_audio=ref_audio,
            ref_text=ref_text if ref_text else None,
            x_vector_only_mode=x_vector_only,
            max_new_tokens=max_new_tokens,
        )
        buf = io.BytesIO()
        sf.write(buf, wavs[0], sr, format="WAV")
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

    for repo_id, model_dir in [
        (DESIGN_REPO_ID, DESIGN_MODEL_DIR),
        (CUSTOM_REPO_ID, CUSTOM_MODEL_DIR),
        (BASE_REPO_ID, BASE_MODEL_DIR),
    ]:
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
