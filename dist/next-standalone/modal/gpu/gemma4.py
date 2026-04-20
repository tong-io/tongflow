from __future__ import annotations

import modal
from typing import List, Optional

REPO_ID = "google/gemma-4-E4B-it"
MODEL_DIR = f"/models/{REPO_ID}"
APP_NAME = "gemma4"

volume = modal.Volume.from_name("models", create_if_missing=True)

# ── app ──────────────────────────────────────────────────────────────────────

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("pytorch/pytorch:2.5.1-cuda12.4-cudnn9-devel")
    .apt_install("ffmpeg")
    .pip_install(
        "transformers==5.5.0",
        "accelerate==1.13.0",
        "torchvision",
        "av>=12.0",
        "librosa==0.10.2.post1",
        "pillow>=10.0",
        "huggingface_hub>=1.5.0,<2.0",
        "flash-attn>=2.5.0",
    )
)

with image.imports():
    import io
    import base64
    import torch
    from transformers import AutoProcessor, AutoModelForMultimodalLM


@app.cls(
    image=image,
    gpu="A10G",
    memory=4096,
    volumes={"/models": volume},
    timeout=600,
)
class Inference:
    @modal.enter()
    def load(self):
        self.processor = AutoProcessor.from_pretrained(MODEL_DIR)
        self.model = AutoModelForMultimodalLM.from_pretrained(
            MODEL_DIR,
            torch_dtype=torch.bfloat16,
            device_map="cuda:0",
        )

    def _infer(self, messages, max_new_tokens, enable_thinking, temperature, top_p, top_k):
        inputs = self.processor.apply_chat_template(
            messages,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
            add_generation_prompt=True,
            enable_thinking=enable_thinking,
        ).to(self.model.device)
        input_len = inputs["input_ids"].shape[-1]

        outputs = self.model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            do_sample=True,
        )
        response = self.processor.decode(
            outputs[0][input_len:], skip_special_tokens=False
        )
        parsed = self.processor.parse_response(response)
        return {
            "text": parsed.get("content", response),
            "thinking": parsed.get("thought", ""),
        }

    def _extract_frames(self, video_bytes, tmp_files):
        """Extract 1fps frames as images using ffmpeg, return (frame_paths, duration)."""
        import tempfile, subprocess, json, os, glob as globmod

        f = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        f.write(video_bytes)
        f.close()
        tmp_files.append(f.name)

        # probe duration and height
        probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_streams", f.name],
            capture_output=True, text=True,
        )
        streams = json.loads(probe.stdout).get("streams", [])
        vs = next((s for s in streams if s["codec_type"] == "video"), None)
        duration = float(vs.get("duration", 0)) if vs else 0
        height = int(vs.get("height", 0)) if vs else 0

        # build ffmpeg filter: 1fps, downscale to 480p if needed
        vf = "fps=1"
        if height > 480:
            vf += ",scale=-2:480"

        out_dir = tempfile.mkdtemp()
        tmp_files.append(out_dir)
        pattern = os.path.join(out_dir, "frame_%04d.jpg")
        subprocess.run(
            ["ffmpeg", "-y", "-i", f.name, "-vf", vf, "-q:v", "2", pattern],
            capture_output=True,
        )
        frames = sorted(globmod.glob(os.path.join(out_dir, "frame_*.jpg")))
        tmp_files.extend(frames)
        return frames, duration

    @modal.method()
    def generate(
        self,
        prompt: str,
        images: Optional[List[bytes]] = None,
        audios: Optional[List[bytes]] = None,
        video: Optional[bytes] = None,
        system: str = "",
        max_new_tokens: int = 1024,
        enable_thinking: bool = False,
        temperature: float = 1.0,
        top_p: float = 0.95,
        top_k: int = 64,
    ) -> dict:
        """
        Multimodal generation with raw bytes input.

        Args:
            prompt: Text prompt.
            images: List of image bytes (PNG/JPEG).
            audios: List of audio bytes (WAV).
            video: Video bytes (MP4).
            system: Optional system prompt.
            max_new_tokens: Max tokens to generate.
            enable_thinking: Enable reasoning mode.

        Returns {"text": ..., "thinking": ...}
        """
        import tempfile, os

        CHUNK_FRAMES = 30

        tmp_files = []

        try:
            content = []

            if images:
                for img_bytes in images:
                    f = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                    f.write(img_bytes)
                    f.close()
                    tmp_files.append(f.name)
                    content.append({"type": "image", "url": f.name})

            if audios:
                for aud_bytes in audios:
                    f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                    f.write(aud_bytes)
                    f.close()
                    tmp_files.append(f.name)
                    content.append({"type": "audio", "audio": f.name})

            if video:
                frames, duration = self._extract_frames(video, tmp_files)

                # short video (<=CHUNK_FRAMES frames): single pass with all frames as images
                if len(frames) <= CHUNK_FRAMES:
                    for i, frame_path in enumerate(frames):
                        content.append({"type": "image", "url": frame_path})
                    video_note = f"The above {len(frames)} images are frames extracted at 1fps from a {int(duration)}s video. "
                    content.append({"type": "text", "text": video_note + prompt})

                    messages = []
                    if system:
                        messages.append({"role": "system", "content": [{"type": "text", "text": system}]})
                    messages.append({"role": "user", "content": content})
                    return self._infer(messages, max_new_tokens, enable_thinking, temperature, top_p, top_k)

                # long video: process in chunks, merge results
                chunk_results = []
                for i in range(0, len(frames), CHUNK_FRAMES):
                    chunk = frames[i:i + CHUNK_FRAMES]
                    t_start = i
                    t_end = i + len(chunk) - 1

                    chunk_content = []
                    for frame_path in chunk:
                        chunk_content.append({"type": "image", "url": frame_path})
                    chunk_content.append({
                        "type": "text",
                        "text": f"These {len(chunk)} images are frames from {t_start}s-{t_end}s of a {int(duration)}s video (segment {i // CHUNK_FRAMES + 1}). {prompt}",
                    })

                    messages = []
                    if system:
                        messages.append({"role": "system", "content": [{"type": "text", "text": system}]})
                    messages.append({"role": "user", "content": chunk_content})

                    result = self._infer(messages, max_new_tokens, enable_thinking, temperature, top_p, top_k)
                    chunk_results.append(f"[{t_start}s-{t_end}s] {result['text']}")

                # merge all chunks
                merge_prompt = f"Based on the following segment-by-segment analysis of a video, provide a unified response to: {prompt}\n\n" + "\n\n".join(chunk_results)
                messages = []
                if system:
                    messages.append({"role": "system", "content": [{"type": "text", "text": system}]})
                messages.append({"role": "user", "content": [{"type": "text", "text": merge_prompt}]})
                return self._infer(messages, max_new_tokens, enable_thinking, temperature, top_p, top_k)

            content.append({"type": "text", "text": prompt})

            messages = []
            if system:
                messages.append({"role": "system", "content": [{"type": "text", "text": system}]})
            messages.append({"role": "user", "content": content})

            return self._infer(messages, max_new_tokens, enable_thinking, temperature, top_p, top_k)
        finally:
            import shutil
            for path in tmp_files:
                if os.path.isdir(path):
                    shutil.rmtree(path, ignore_errors=True)
                elif os.path.exists(path):
                    os.unlink(path)


# ── model_downloader ─────────────────────────────────────────────────────────

model_downloader = modal.App("model_downloader")


@model_downloader.function(
    image=modal.Image.debian_slim(python_version="3.11").pip_install(
        "huggingface_hub==1.6.0"
    ),
    volumes={"/models": volume},
    timeout=3600,
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
    )
    volume.commit()
    print(f"Model downloaded to {MODEL_DIR}")


@model_downloader.local_entrypoint()
def download():
    _download.remote()
