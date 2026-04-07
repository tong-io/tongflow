"""
FLUX.2-klein-9B **KV**：图像编辑 / 多参考编辑 / 文生图（参考图条件走 KV cache，多参考更省）。

对齐本目录其它脚本：共享 ``models`` 卷、独立 ``model_downloader``、镜像内 ``git clone`` 上游推理仓库。

权重：``black-forest-labs/FLUX.2-klein-9B-kv``，文件名 ``flux-2-klein-9b-kv.safetensors``；环境变量 ``KLEIN_9B_KV_MODEL_PATH``。

为什么除了 Klein 还要动 ``FLUX.2-dev``？
  **Klein 流模型权重里不包含图像 VAE。**
  编辑管线需要：原图 → **VAE 编码** → latent 上条件生成 → **VAE 解码** → 输出图。
  官方 ``flux2`` 代码（``util.py``）里 VAE 固定为单文件 ``ae.safetensors``，且 **托管在**
  `black-forest-labs/FLUX.2-dev <https://huggingface.co/black-forest-labs/FLUX.2-dev>`_，
  因此下载器只拉 **这一文件**，**不是** 整包 32B 的 ``FLUX.2 [dev]`` 权重。

  Klein 仓库里另有 diffusers 风格的 ``vae/``，与当前脚本使用的 **原生 ``AutoEncoder`` + ``ae.safetensors``**
  加载方式不一致，不能在不改 ``flux2`` 源码的情况下直接替代。

  若已在本机别处有兼容的 ``ae.safetensors``，可设环境变量 ``AE_MODEL_PATH`` 指向该文件，并跳过对
  ``FLUX.2-dev`` 的下载（需自行保证与 FLUX.2 训练时一致）。

``FLUX.2-dev`` 仓库为 gated：在 Hugging Face 接受条款后，用**同一账号**的 ``HF_TOKEN`` 写入 Modal Secret
``huggingface``（与 ``ltx.py`` 相同），否则拉 ``ae.safetensors`` 会 403。

部署::

    modal deploy gpu/flux2_klein9b.py

预拉权重::

    modal run gpu/flux2_klein9b.py::download
"""

from __future__ import annotations

import gc
import io
import os
import random
from typing import Any, List, Optional

import modal

FLUX2_GIT = "https://github.com/black-forest-labs/flux2.git"
FLUX2_DIR = "/opt/flux2"

HF_KLEIN_KV = "black-forest-labs/FLUX.2-klein-9B-kv"
HF_DEV = "black-forest-labs/FLUX.2-dev"
HF_QWEN = "Qwen/Qwen3-8B-FP8"

KLEIN_KV_DIR = f"/models/{HF_KLEIN_KV}"
DEV_DIR = f"/models/{HF_DEV}"
QWEN_DIR = f"/models/{HF_QWEN}"
KLEIN_KV_WEIGHTS = f"{KLEIN_KV_DIR}/flux-2-klein-9b-kv.safetensors"
AE_WEIGHTS = f"{DEV_DIR}/ae.safetensors"

# Modal App 名保持不变，避免已部署的 openflow handler（仍指向该 app）要改代码。
APP_NAME = "flux2-klein-9b"
MODEL_KEY = "flux.2-klein-9b-kv"

volume = modal.Volume.from_name("models", create_if_missing=True)

# ── app ──────────────────────────────────────────────────────────────────────

app = modal.App(APP_NAME)

image = (
    # 使用 *-devel 镜像：runtime 版无 gcc，部分依赖（如 Triton / 内核 JIT）会报
    # ``Failed to find C compiler``；与 gemma4.py 一致。
    modal.Image.from_registry("pytorch/pytorch:2.5.1-cuda12.4-cudnn9-devel")
    .apt_install("git", "build-essential")
    .run_commands(f"git clone --depth 1 {FLUX2_GIT} {FLUX2_DIR}")
    .pip_install(
        "einops==0.8.1",
        "transformers==4.56.1",
        "safetensors>=0.4.5",
        "accelerate==1.12.0",
        "pillow>=10.0",
        "huggingface_hub>=0.25",
        "torchvision",
    )
    .env(
        {
            "PYTHONPATH": f"{FLUX2_DIR}/src",
            "HF_HOME": "/models/hf",
            # 减轻显存碎片（PyTorch 官方建议）
            "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        }
    )
)

# Klein + Qwen3 TE + VAE 同时驻留 GPU 会顶满 48GB；推理时按官方 CLI 做 CPU offload（流模型先放 CPU，
# 编完文本再换到 GPU）。GPU 用 L40S 即可。
@app.cls(
    image=image,
    gpu="L40S",
    volumes={"/models": volume},
    timeout=1200,
)
class Inference:
    @staticmethod
    def _patch_local_weights():
        """若 ``download`` 已把权重落到 ``/models/...``，则走本地路径，避免重复从 Hub 拉。"""
        from flux2.text_encoder import Qwen3Embedder
        import flux2.util as util

        if os.path.isfile(KLEIN_KV_WEIGHTS):
            os.environ["KLEIN_9B_KV_MODEL_PATH"] = KLEIN_KV_WEIGHTS
        if os.path.isfile(AE_WEIGHTS):
            os.environ["AE_MODEL_PATH"] = AE_WEIGHTS
        if os.path.isfile(os.path.join(QWEN_DIR, "config.json")):

            def _te_klein(device="cuda"):
                return Qwen3Embedder(model_spec=QWEN_DIR, device=device)

            util.FLUX2_MODEL_INFO[MODEL_KEY]["text_encoder_load_fn"] = _te_klein

    @modal.enter()
    def load(self):
        import torch

        self._patch_local_weights()

        from flux2.util import FLUX2_MODEL_INFO, load_ae, load_flow_model, load_text_encoder

        self.torch_device = torch.device("cuda")
        self.model_info = FLUX2_MODEL_INFO[MODEL_KEY]
        self.text_encoder = load_text_encoder(MODEL_KEY, device=self.torch_device)
        # 流模型先加载在 CPU，`_generate` 里再搬到 GPU，避免与 Qwen3 同时占显存。
        self.model = load_flow_model(MODEL_KEY, debug_mode=False, device="cpu")
        self.ae = load_ae(MODEL_KEY, device=self.torch_device)
        self.model.eval()
        self.ae.eval()
        self.text_encoder.eval()
        volume.commit()

    def _generate(
        self,
        prompt: str,
        pil_images: List[Any],
        width: int,
        height: int,
        seed: Optional[int],
    ) -> Any:
        import torch
        from einops import rearrange
        from PIL import Image
        from flux2.sampling import (
            batched_prc_img,
            batched_prc_txt,
            denoise,
            denoise_cached,
            encode_image_refs,
            get_schedule,
            scatter_ids,
        )

        dev = self.torch_device
        defaults = self.model_info.get("defaults", {})
        num_steps = defaults["num_steps"]
        guidance = defaults["guidance"]

        with torch.inference_mode():
            ref_tokens, ref_ids = encode_image_refs(self.ae, pil_images)

            ctx = self.text_encoder([prompt]).to(torch.bfloat16)
            ctx, ctx_ids = batched_prc_txt(ctx)

            # 与官方 scripts/cli.py cpu_offloading：编完 prompt 后卸文本编码器，再上流模型。
            self.text_encoder.cpu()
            gc.collect()
            torch.cuda.empty_cache()
            self.model.to(dev)

            shape = (1, 128, height // 16, width // 16)
            gen_seed = seed if seed is not None else random.randrange(2**31)
            generator = torch.Generator(device="cuda").manual_seed(gen_seed)
            randn = torch.randn(
                shape, generator=generator, dtype=torch.bfloat16, device="cuda"
            )
            x, x_ids = batched_prc_img(randn)

            timesteps = get_schedule(num_steps, x.shape[1])
            use_kv = bool(self.model_info.get("use_kv_cache")) and (
                ref_tokens is not None and ref_ids is not None
            )
            if use_kv:
                x = denoise_cached(
                    self.model,
                    x,
                    x_ids,
                    ctx,
                    ctx_ids,
                    timesteps=timesteps,
                    guidance=guidance,
                    img_cond_seq=ref_tokens,
                    img_cond_seq_ids=ref_ids,
                )
            else:
                x = denoise(
                    self.model,
                    x,
                    x_ids,
                    ctx,
                    ctx_ids,
                    timesteps=timesteps,
                    guidance=guidance,
                    img_cond_seq=ref_tokens,
                    img_cond_seq_ids=ref_ids,
                )
            del ctx, ctx_ids, ref_tokens, ref_ids

            self.model.cpu()
            gc.collect()
            torch.cuda.empty_cache()

            x = torch.cat(scatter_ids(x, x_ids)).squeeze(2)
            x = self.ae.decode(x).float()
            x = x.clamp(-1, 1)
            x = rearrange(x[0], "c h w -> h w c")

            self.text_encoder.to(dev)

        return Image.fromarray((127.5 * (x + 1.0)).cpu().byte().numpy())

    @modal.method()
    def edit(
        self,
        prompt: str,
        image: bytes,
        seed: Optional[int] = None,
        match_input_size: bool = True,
        width: int = 1360,
        height: int = 768,
    ) -> bytes:
        from PIL import Image

        pil = Image.open(io.BytesIO(image)).convert("RGB")
        w, h = (pil.size[0], pil.size[1]) if match_input_size else (width, height)
        out = self._generate(prompt, [pil], w, h, seed)
        buf = io.BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()

    @modal.method()
    def edit_multi(
        self,
        prompt: str,
        images: List[bytes],
        seed: Optional[int] = None,
        width: int = 1360,
        height: int = 768,
    ) -> bytes:
        from PIL import Image

        pil_images = [Image.open(io.BytesIO(b)).convert("RGB") for b in images]
        out = self._generate(prompt, pil_images, width, height, seed)
        buf = io.BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()

    @modal.method()
    def text_to_image(
        self,
        prompt: str,
        seed: Optional[int] = None,
        width: int = 1360,
        height: int = 768,
    ) -> bytes:
        from PIL import Image

        out = self._generate(prompt, [], width, height, seed)
        buf = io.BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()


# ── model_downloader ─────────────────────────────────────────────────────────

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
    """
    Download Klein **KV** flow weights, AE (``ae.safetensors`` from FLUX.2-dev), and Qwen text encoder.

    Raises ``RuntimeError`` with a plain message on failure so local ``modal run`` does not
    need ``huggingface_hub`` to deserialize gated-repo exceptions.
    """
    from huggingface_hub import hf_hub_download, snapshot_download

    token = os.environ.get("HF_TOKEN")
    if not token:
        print("Warning: HF_TOKEN is empty; gated repos (FLUX.2-dev, etc.) will return 403.")

    try:
        kv_marker = os.path.join(KLEIN_KV_DIR, "flux-2-klein-9b-kv.safetensors")
        if not (os.path.exists(kv_marker) and os.path.getsize(kv_marker) > 1000):
            print(f"Downloading {HF_KLEIN_KV} -> {KLEIN_KV_DIR} ...")
            os.makedirs(KLEIN_KV_DIR, exist_ok=True)
            snapshot_download(repo_id=HF_KLEIN_KV, local_dir=KLEIN_KV_DIR, token=token)
            print(f"Done: {KLEIN_KV_DIR}")

        ae_marker = os.path.join(DEV_DIR, "ae.safetensors")
        if not (os.path.exists(ae_marker) and os.path.getsize(ae_marker) > 1000):
            # Full snapshot of FLUX.2-dev is gated and unnecessary — only ae.safetensors is needed.
            print(f"Downloading ae.safetensors from {HF_DEV} (gated; license required) ...")
            os.makedirs(DEV_DIR, exist_ok=True)
            hf_hub_download(
                repo_id=HF_DEV,
                filename="ae.safetensors",
                local_dir=DEV_DIR,
                token=token,
            )
            print(f"Done: {ae_marker}")

        qwen_marker = os.path.join(QWEN_DIR, "config.json")
        if not os.path.exists(qwen_marker):
            print(f"Downloading {HF_QWEN} -> {QWEN_DIR} ...")
            os.makedirs(QWEN_DIR, exist_ok=True)
            snapshot_download(repo_id=HF_QWEN, local_dir=QWEN_DIR, token=token)
            print(f"Done: {QWEN_DIR}")

        volume.commit()
    except Exception as e:
        raise RuntimeError(
            "Hugging Face download failed. "
            "For black-forest-labs/FLUX.2-dev you must accept the model license on Hugging Face "
            "and use an HF_TOKEN that has access (Modal secret `huggingface`). "
            f"Original: {type(e).__name__}: {e}"
        ) from None


@model_downloader.local_entrypoint()
def download():
    _download.remote()
