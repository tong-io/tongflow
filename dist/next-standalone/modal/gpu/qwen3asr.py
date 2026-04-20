"""
Qwen3-ASR on Modal. TypeScript handlers: src/handlers/modal/qwen3-asr.ts
(features: transcribe → qwen3-asr, transcribe_timestamp → qwen3-asr-timestamp).

Callers (openflow ``qwen3-asr.ts``) send ``audio_bytes`` + ``filename`` after fetching
via ``fetchModalAssetBytes`` (supports ``/api/uploads/...`` and HTTPS). Video files
are demuxed to 16 kHz mono WAV with ffmpeg before ASR.

Deploy: modal deploy modal/gpu/qwen3asr.py
Models:  modal run modal/gpu/qwen3asr.py::download
"""

from __future__ import annotations

import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional

import modal

ASR_REPO_ID = "Qwen/Qwen3-ASR-1.7B"
ALIGNER_REPO_ID = "Qwen/Qwen3-ForcedAligner-0.6B"
ASR_MODEL_DIR = f"/models/{ASR_REPO_ID}"
ALIGNER_MODEL_DIR = f"/models/{ALIGNER_REPO_ID}"
APP_NAME = "qwen3-asr"

volume = modal.Volume.from_name("models", create_if_missing=True)

# ── app ──────────────────────────────────────────────────────────────────────

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("pytorch/pytorch:2.5.1-cuda12.4-cudnn9-devel")
    .apt_install("ffmpeg", "sox", "libsox-dev")
    .pip_install(
        "qwen-asr==0.0.6",
        "transformers==4.57.6",
        "accelerate==1.12.0",
        "soundfile==0.13.1",
        "librosa==0.10.2.post1",
        "torchaudio",
        "huggingface_hub>=0.34.0,<1.0",
        "flash-attn>=2.5.0",
    )
)

with image.imports():
    import torch
    from qwen_asr import Qwen3ASRModel

# ── video → audio (ffmpeg), runs in the same container as ASR ───────────────

_VIDEO_EXTS = frozenset(
    {
        ".mp4",
        ".webm",
        ".mov",
        ".mkv",
        ".avi",
        ".m4v",
        ".mpeg",
        ".mpg",
        ".flv",
        ".wmv",
        ".3gp",
    }
)


def _ffmpeg_extract_wav(video_path: Path, wav_path: Path) -> None:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        str(wav_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg extract audio failed: {proc.stderr or proc.stdout}"
        )


@contextmanager
def _asr_audio_input_from_bytes(
    audio_bytes: bytes, filename: str
) -> Generator[str, None, None]:
    """
    Write ``audio_bytes`` to a temp file; if extension is a known video type,
    ffmpeg-extract WAV, else pass the file path to Qwen ASR (audio formats).
    """
    name = filename.strip() or "media.bin"
    suffix = Path(name).suffix.lower() or ".bin"
    with tempfile.TemporaryDirectory(prefix="qwen3asr_") as td:
        tdir = Path(td)
        media_path = tdir / f"input{suffix}"
        media_path.write_bytes(audio_bytes)
        if suffix in _VIDEO_EXTS:
            wav = tdir / "for_asr.wav"
            _ffmpeg_extract_wav(media_path, wav)
            yield str(wav)
        else:
            yield str(media_path)


def _align_result_to_list(result):
    if result is None:
        return None
    return [
        {
            "text": it.text,
            "start_time": float(it.start_time),
            "end_time": float(it.end_time),
        }
        for it in result.items
    ]


@app.cls(
    image=image,
    gpu="L4",
    volumes={"/models": volume},
)
class Transcribe:
    """Qwen3-ASR-1.7B only (no forced aligner). Lower VRAM than `TranscribeWithTimestamps`."""

    @modal.enter()
    def load(self):
        self.asr = Qwen3ASRModel.from_pretrained(
            ASR_MODEL_DIR,
            device_map="cuda:0",
            dtype=torch.bfloat16,
            attn_implementation="flash_attention_2",
            max_inference_batch_size=32,
            max_new_tokens=512,
        )

    @modal.method()
    def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "media.bin",
        context: str = "",
        language: Optional[str] = None,
        max_new_tokens: int = 512,
    ) -> dict:
        """
        Transcribe from raw file bytes (same pattern as ``flux2_klein9b`` ``image: bytes``).
        ``filename`` suffix selects video (ffmpeg) vs audio path.
        """
        self.asr.max_new_tokens = max_new_tokens
        lang = language if (language and str(language).strip()) else None
        with _asr_audio_input_from_bytes(audio_bytes, filename) as asr_src:
            results = self.asr.transcribe(
                audio=asr_src,
                context=context,
                language=lang,
                return_time_stamps=False,
            )
        r = results[0]
        return {"language": r.language, "text": r.text}


@app.cls(
    image=image,
    gpu="L4",
    volumes={"/models": volume},
)
class TranscribeWithTimestamps:
    """ASR + Qwen3-ForcedAligner for per-token timestamps."""

    @modal.enter()
    def load(self):
        self.asr = Qwen3ASRModel.from_pretrained(
            ASR_MODEL_DIR,
            device_map="cuda:0",
            dtype=torch.bfloat16,
            attn_implementation="flash_attention_2",
            forced_aligner=ALIGNER_MODEL_DIR,
            forced_aligner_kwargs=dict(
                dtype=torch.bfloat16,
                device_map="cuda:0",
                attn_implementation="flash_attention_2",
            ),
            max_inference_batch_size=32,
            max_new_tokens=512,
        )

    @modal.method()
    def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "media.bin",
        context: str = "",
        language: Optional[str] = None,
        max_new_tokens: int = 512,
    ) -> dict:
        self.asr.max_new_tokens = max_new_tokens
        lang = language if (language and str(language).strip()) else None
        with _asr_audio_input_from_bytes(audio_bytes, filename) as asr_src:
            results = self.asr.transcribe(
                audio=asr_src,
                context=context,
                language=lang,
                return_time_stamps=True,
            )
        r = results[0]
        return {
            "language": r.language,
            "text": r.text,
            "time_stamps": _align_result_to_list(r.time_stamps),
        }


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
        (ASR_REPO_ID, ASR_MODEL_DIR),
        (ALIGNER_REPO_ID, ALIGNER_MODEL_DIR),
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
