"""
SeedVR2：视频 / 图像超分（Modal GPU）。

权重：`ByteDance-Seed/SeedVR2-3B <https://huggingface.co/ByteDance-Seed/SeedVR2-3B>`_（默认）与
`SeedVR2-7B <https://huggingface.co/ByteDance-Seed/SeedVR2-7B>`_（``SEEDVR2_MODEL_SIZE=7b``），
代码：`bytedance-seed/SeedVR <https://github.com/bytedance-seed/SeedVR>`_。

``pos_emb.pt`` / ``neg_emb.pt`` 在 **3B** 仓库；7B 部署时仍从该路径读取（下载任务会拉齐两个 HF 仓库）。

**分辨率档位** ``resolution``：与 `ComfyUI-SeedVR2_VideoUpscaler` 一致——按**最短边**目标像素缩放，并可选用 ``max_edge`` 限制任意一边最大值；再 **DivisiblePad(16)**（不裁切），解码后按真实目标宽高 **裁剪掉 pad**，与官方节点 ``prepare_video_transforms`` / Phase 3 trim 行为一致。

- ``1k``：短边 1080，单边最大 1920（常见 16:9 对应长边 1920）
- ``2k``：短边 1440，单边最大 2560
- ``4k``：短边 **4096**、单边最大 **4096**（与 ``SeedVR2_4K_image_upscale`` / 节点里 ``resolution`` + ``max_resolution`` 同为 4096 的用法一致；远高于「仅 UHD 2160p 短边」）

默认 GPU 使用 ``A100-80GB``：**7B** 激活显存高于 3B；若 OOM 可改为 ``H100``、设 ``SEEDVR2_MODEL_SIZE=3b``，或降 ``resolution`` / ``batch_size``。``L40S`` 等 48GB 级卡对 7B 超分通常吃紧。

镜像内将 ``fusedrms`` / ``fusedln`` 回落到 ``RMSNorm`` / ``LayerNorm``，避免依赖 Apex 预编译 wheel
与 PyTorch 版本强绑定。

**与** `ComfyUI-SeedVR2_VideoUpscaler` **及** ``SeedVR2_HD_video_upscale.json`` **对齐**：

- **3B 默认**：``configs_3b`` + ``seedvr2_ema_3b.pth``；HF 无单独 sharp 权重时 ``dit_variant=sharp`` 与 ``ema`` 共用同一 checkpoint。
- **批处理**：默认 ``batch_size=33``（4n+1）、``uniform_batch_size=True``、``temporal_overlap=3``（与示例工作流一致；显存紧可减小 ``batch_size``）。
- **Offload**：默认 ``SEEDVR2_TENSOR_OFFLOAD=1``，编码后 latent 暂存 CPU 再上 DiT（与节点 ``offload_device: cpu`` 同思路）；设为 ``0`` 跳过硬拷贝。
- **torch.compile**：默认关闭；设 ``SEEDVR2_TORCH_COMPILE=1`` 可对 DiT/VAE 做 inductor 编译（与 ``SeedVR2TorchCompileSettings`` 类似），**首包编译耗时可很长**。

预处理与默认 **LAB** 色校（``color_fix_lab``）、DiT **默认 sharp**（7B 时与 ``seedvr2_ema_7b_sharp`` 工作流一致）。``SEEDVR2_DIT_VARIANT`` 控制冷启动加载权重。VAE **空间分块** encode/decode（默认 ``tile_size=1024``、``overlap=128``；``SEEDVR2_VAE_TILE_*`` 可覆盖；``SEEDVR2_VAE_TILING=0`` 关闭）。

**LAB 速度**：4K 下全分辨率 wavelet/LAB 极慢。默认 ``SEEDVR2_LAB_MAX_EDGE=1920``；``0`` 为全分辨率。或 ``color_correction=none``。

部署::

    modal deploy gpu/seedvr2.py

预拉权重（3B + 7B 两个仓库）::

    modal run gpu/seedvr2.py::download
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Literal, Optional, Tuple, Union

import modal


def _sr_log(msg: str) -> None:
    """Modal / 非 TTY 环境下 tqdm 常不可见；用 flush 的 print 便于判断卡在哪一步。"""
    print(f"[seedvr2] {msg}", flush=True)

SEEDVR_GIT = "https://github.com/bytedance-seed/SeedVR.git"
SEEDVR_ROOT = "/opt/SeedVR"

HF_REPO_3B = "ByteDance-Seed/SeedVR2-3B"
HF_REPO_7B = "ByteDance-Seed/SeedVR2-7B"

MODEL_DIR_3B = f"/models/{HF_REPO_3B}"
MODEL_DIR_7B = f"/models/{HF_REPO_7B}"

COND_NOISE_SCALE = 0.0


def _dit_ckpt_for_size(size: Literal["3b", "7b"]) -> dict[str, str]:
    """HF 文件名；3B 仅 ``seedvr2_ema_3b.pth``，sharp 与 ema 共用（与 Comfy API 兼容）。"""
    if size == "3b":
        p = "seedvr2_ema_3b.pth"
        return {"ema": p, "sharp": p}
    return {
        "ema": "seedvr2_ema_7b.pth",
        "sharp": "seedvr2_ema_7b_sharp.pth",
    }


def _norm_model_size(v: object | None) -> Literal["3b", "7b"]:
    x = (str(v).strip().lower() if v is not None else "") or "3b"
    if x in ("7b", "7"):
        return "7b"
    return "3b"


# 在 ``Inference.load`` 内按 ``SEEDVR2_MODEL_SIZE`` 覆盖；此处默认 3B 供 import 期类型检查
DIT_CKPT: dict[str, str] = _dit_ckpt_for_size("3b")

# 与 ``SeedVR2_HD_video_upscale.json`` / Comfy 示例一致（4n+1 batch、overlap）；显存紧请减小 batch_size
DEFAULT_SEED = 42
DEFAULT_VIDEO_BATCH_SIZE = 33
DEFAULT_UNIFORM_BATCH_SIZE = True
DEFAULT_TEMPORAL_OVERLAP = 3

APP_NAME = "seedvr2"

volume = modal.Volume.from_name("models", create_if_missing=True)

# 与 ComfyUI 节点 ``resolution`` / ``max_resolution`` 对齐：短边目标、单边上限（0 表示不设上限）
TIER_COMFY_RESOLUTION: dict[str, tuple[int, int]] = {
    "1k": (1080, 1920),
    "2k": (1440, 2560),
    # 与 4K 示例工作流（resolution=max_resolution=4096）一致；显存不够时请用 2k 或更小
    "4k": (4096, 4096),
}


def _tier_to_short_and_max_edge(tier: str) -> tuple[int, int]:
    if tier not in TIER_COMFY_RESOLUTION:
        raise ValueError(f"resolution must be one of {list(TIER_COMFY_RESOLUTION)}, got {tier!r}")
    return TIER_COMFY_RESOLUTION[tier]


def _norm_dit_variant(v: object) -> Literal["ema", "sharp"]:
    x = (str(v).strip().lower() if v is not None else "") or "sharp"
    if x in DIT_CKPT:
        return x  # type: ignore[return-value]
    return "sharp"


def _norm_color_correction(
    v: str,
) -> Literal["lab", "none"]:
    x = (v or "lab").lower().strip()
    if x in ("lab", "none"):
        return x  # type: ignore[return-value]
    return "lab"


def _side_resize_tchw(
    video_tchw: "torch.Tensor",
    short_edge: int,
    max_edge: int,
    *,
    chunk_frames: int = 16,
) -> "torch.Tensor":
    """与 ComfyUI ``SideResize`` + ``max_size`` 一致；输入 ``TCHW`` [0,1]。

    在 **CPU** 上做 bicubic 缩放，避免整段视频在 GPU 上 ``interpolate`` 时峰值显存（可达数十 GiB）。
    按 ``chunk_frames`` 分块处理，降低单次临时内存。
    """
    import torch
    from torchvision.transforms import InterpolationMode
    from torchvision.transforms import functional as TVF

    x = video_tchw.detach().cpu().float().clamp(0.0, 1.0)
    t = x.shape[0]
    if t == 0:
        return x

    interp = InterpolationMode.BICUBIC

    def _resize_batch(v: "torch.Tensor") -> "torch.Tensor":
        o = TVF.resize(v, short_edge, interpolation=interp, antialias=True).clamp(0.0, 1.0)
        if max_edge > 0:
            _, _, nh, nw = o.shape
            if max(nh, nw) > max_edge:
                scale = max_edge / max(nh, nw)
                new_h = max(1, round(nh * scale))
                new_w = max(1, round(nw * scale))
                o = TVF.resize(
                    o, (new_h, new_w), interpolation=interp, antialias=True
                ).clamp(0.0, 1.0)
        return o

    cf = max(1, int(chunk_frames))
    if t <= cf:
        return _resize_batch(x)

    t0 = time.perf_counter()
    _sr_log(
        f"SideResize: {t} frames × {x.shape[-2]}×{x.shape[-1]} (CPU bicubic, chunk={cf}); "
        "this step can take minutes on long clips…"
    )
    parts: list[torch.Tensor] = []
    for i, s in enumerate(range(0, t, cf)):
        e = min(s + cf, t)
        parts.append(_resize_batch(x[s:e]))
        # 每 8 个 chunk 或最后一帧打一行，避免刷屏
        if i % 8 == 0 or e == t:
            _sr_log(
                f"SideResize: {e}/{t} frames ({100.0 * e / t:.0f}%) "
                f"{time.perf_counter() - t0:.1f}s"
            )
    _sr_log(f"SideResize: done in {time.perf_counter() - t0:.1f}s")
    return torch.cat(parts, dim=0)


def _true_hw_even(tchw: "torch.Tensor") -> tuple[int, int]:
    """与 ComfyUI ``compute_generation_info`` 一致：长宽向下取偶（编码兼容）。"""
    _, _, h, w = tchw.shape
    return (h // 2) * 2, (w // 2) * 2


def _divisible_pad_tchw(video_tchw: "torch.Tensor", factor: int = 16) -> "torch.Tensor":
    """与 ComfyUI ``DivisiblePad`` 一致：右下补零，不丢像素。"""
    import torch.nn.functional as F

    _, _, h, w = video_tchw.shape
    pad_h = (factor - (h % factor)) % factor
    pad_w = (factor - (w % factor)) % factor
    if pad_h == 0 and pad_w == 0:
        return video_tchw
    return F.pad(video_tchw, (0, pad_w, 0, pad_h), mode="constant", value=0.0)


def _norm_batch_size_4n1(n: int) -> int:
    """ComfyUI 约束：每批帧数为 ``4n+1``。取不超过 ``n`` 的最大合法值（至少为 1）。"""
    n = max(1, int(n))
    r = (n - 1) % 4
    return n - r


def _frames_pad_to_4n1(t: int) -> int:
    """将长度 ``t`` 补到满足 ``(t-1) % 4 == 0``（与 ``_cut_videos`` / VAE 时序一致）所需增加帧数。"""
    if t <= 0:
        return 0
    if (t - 1) % 4 == 0:
        return 0
    return 4 - (t - 1) % 4


def _pad_tchw_repeat_last(x: "torch.Tensor", n: int) -> "torch.Tensor":
    """沿 T 维（dim0）重复末帧补齐，``x`` 为 ``TCHW``。"""
    import torch

    if n <= 0:
        return x
    last = x[-1:].expand(n, *x.shape[1:]).contiguous()
    return torch.cat([x, last], dim=0)


def _iter_batch_ranges(
    total_frames: int,
    batch_size: int,
    temporal_overlap: int,
) -> list[tuple[int, int]]:
    """与 ``ComfyUI-SeedVR2`` ``encode_all_batches`` 索引逻辑一致（``temporal_overlap==0`` 时无重叠块）。"""
    if total_frames <= 0:
        return []
    step = batch_size - temporal_overlap if temporal_overlap > 0 else batch_size
    if step <= 0:
        step = batch_size
        temporal_overlap = 0
    out: list[tuple[int, int]] = []
    for batch_idx in range(0, total_frames, step):
        if batch_idx == 0:
            start_idx = 0
            end_idx = min(batch_size, total_frames)
        else:
            start_idx = batch_idx
            end_idx = min(start_idx + batch_size, total_frames)
            if end_idx - start_idx <= temporal_overlap:
                break
        out.append((start_idx, end_idx))
    return out


def _blend_overlapping_thwc(
    prev_tail: "torch.Tensor",
    cur_head: "torch.Tensor",
    overlap: int,
) -> "torch.Tensor":
    """``[overlap, H, W, C]`` 交叉淡化，对齐 Comfy ``blend_overlapping_frames``。"""
    import torch

    device = prev_tail.device
    dtype = prev_tail.dtype
    if overlap >= 3:
        t = torch.linspace(0.0, 1.0, steps=overlap, device=device, dtype=dtype)
        blend_start = 1.0 / 3.0
        blend_end = 2.0 / 3.0
        u = ((t - blend_start) / (blend_end - blend_start)).clamp(0.0, 1.0)
        w_prev_1d = 0.5 + 0.5 * torch.cos(torch.pi * u)
    else:
        w_prev_1d = torch.linspace(1.0, 0.0, steps=overlap, device=device, dtype=dtype)
    w_prev = w_prev_1d.view(overlap, 1, 1, 1)
    w_cur = 1.0 - w_prev
    return prev_tail * w_prev + cur_head * w_cur


def _stitch_thwc_batches(
    parts: list["torch.Tensor"],
    temporal_overlap: int,
) -> "torch.Tensor":
    """``parts`` 各为 ``[T_i, H, W, C]`` float（与解码后一致）。``overlap==0`` 时直接拼接。"""
    import torch

    if not parts:
        raise ValueError("empty parts")
    if temporal_overlap <= 0:
        return torch.cat(parts, dim=0)
    out = parts[0]
    for nxt in parts[1:]:
        if nxt.shape[0] <= temporal_overlap:
            raise ValueError("batch shorter than temporal_overlap")
        prev_tail = out[-temporal_overlap:]
        cur_head = nxt[:temporal_overlap]
        blended = _blend_overlapping_thwc(prev_tail, cur_head, temporal_overlap)
        out = torch.cat([out[:-temporal_overlap], blended, nxt[temporal_overlap:]], dim=0)
    return out


def _parse_lab_max_edge() -> int:
    """LAB 色校长边超过该值时先缩小再 ``lab_color_transfer`` 再拉回，4K 下可快一个数量级。

    - ``SEEDVR2_LAB_MAX_EDGE``：默认 ``1920``；``0`` / ``full`` / 空 表示**全分辨率**（与 Comfy 一致，最慢）。
    """
    raw = os.environ.get("SEEDVR2_LAB_MAX_EDGE", "1920").strip().lower()
    if raw in ("", "0", "full", "false", "off"):
        return 0
    try:
        return max(0, int(raw))
    except ValueError:
        return 1920


def _trim_decode_sample_cthw(
    sample: "torch.Tensor",
    ori_length: int,
    true_h: int,
    true_w: int,
) -> "torch.Tensor":
    """解码结果为 ``CTHW`` 或单帧 ``CHW``；按真实帧数与时序裁剪。"""
    import torch

    sample = sample.to("cpu")
    if sample.ndim == 4:
        if ori_length < sample.shape[1]:
            sample = sample[:, :ori_length, :, :]
        sample = sample[:, :, :true_h, :true_w]
    elif sample.ndim == 3:
        sample = sample[:, :true_h, :true_w]
    else:
        raise ValueError(f"unexpected sample ndim={sample.ndim}")
    return sample


def _lab_cthw_pair(
    sample_cthw: "torch.Tensor",
    ref_tchw_01: "torch.Tensor",
) -> "torch.Tensor":
    """LAB 色校：``sample_cthw`` 与 ``ref_tchw`` 同帧数、``ref`` 为 ``[0,1]`` ``TCHW``。

    4K 下全分辨率 wavelet/LAB 极慢；默认按 ``_parse_lab_max_edge()`` 在较小分辨率上做色校再拉回。
    """
    import torch
    import torch.nn.functional as F
    from color_fix_lab import lab_color_transfer

    squeeze_time_after_lab = False
    if sample_cthw.ndim == 3:
        sample_cthw = sample_cthw.unsqueeze(1)
        squeeze_time_after_lab = True
    ref = ref_tchw_01.to(device=sample_cthw.device, dtype=sample_cthw.dtype)
    ref = ref * 2.0 - 1.0
    tc = sample_cthw.permute(1, 0, 2, 3)
    _cc, _cr = tc.shape[1], ref.shape[1]
    if _cc != _cr:
        if _cc == 1 and _cr == 3:
            tc = tc.repeat(1, 3, 1, 1)
        elif _cc == 3 and _cr == 1:
            ref = ref.repeat(1, 3, 1, 1)
        else:
            raise ValueError(
                f"LAB: channel mismatch upscaled={_cc} ref={_cr} (expected 1↔3 or equal)"
            )

    lab_max = _parse_lab_max_edge()
    _, _, H, W = tc.shape
    m = max(H, W)
    if lab_max > 0 and m > lab_max:
        scale = lab_max / m
        nh = max(4, (int(round(H * scale)) // 2) * 2)
        nw = max(4, (int(round(W * scale)) // 2) * 2)
        tc = F.interpolate(tc, size=(nh, nw), mode="bilinear", align_corners=False)
        ref = F.interpolate(ref, size=(nh, nw), mode="bilinear", align_corners=False)
        tc = lab_color_transfer(tc, ref, None, 0.8)
        tc = F.interpolate(tc, size=(H, W), mode="bicubic", align_corners=False)
    else:
        tc = lab_color_transfer(tc, ref, None, 0.8)

    out = tc.permute(1, 0, 2, 3)
    if squeeze_time_after_lab:
        out = out.squeeze(1)
    return out


# VAE spatial tiling: line-synced with
# ComfyUI-SeedVR2_VideoUpscaler/src/models/video_vae_v3/modules/attn_video_vae.py
# (kl_encode/kl_decode/tiled_encode/tiled_decode + wrapper_encode/decode; @apply_forward_hook omitted).

def patch_vae_classes(VideoAutoencoderKL, VideoAutoencoderKLWrapper) -> None:
    from diffusers.models.autoencoders.vae import DecoderOutput, DiagonalGaussianDistribution
    from diffusers.models.modeling_outputs import AutoencoderKLOutput
    import torch

    from models.video_vae_v3.modules.types import (
        CausalDecoderOutput,
        CausalEncoderOutput,
    )

    VideoAutoencoderKL.debug = None
    VideoAutoencoderKLWrapper.debug = None

    def kl_encode(self, x: torch.FloatTensor, return_dict: bool = True, 
               tiled: bool = False, tile_size: Tuple[int, int] = (512, 512), 
               tile_overlap: Tuple[int, int] = (64, 64)) -> AutoencoderKLOutput:
        if tiled:
            h = self.tiled_encode(x, tile_size=tile_size, tile_overlap=tile_overlap)
        else:
            h = self.slicing_encode(x)

        posterior = DiagonalGaussianDistribution(h)

        if not return_dict:
            return (posterior,)

        return AutoencoderKLOutput(latent_dist=posterior)
    def kl_decode(self, z: torch.Tensor, return_dict: bool = True, 
               tiled: bool = False, tile_size: Tuple[int, int] = (512, 512), 
               tile_overlap: Tuple[int, int] = (64, 64)) -> Union[DecoderOutput, torch.Tensor]:

        if tiled:
            decoded = self.tiled_decode(z, tile_size=tile_size, tile_overlap=tile_overlap)
        else:
            decoded = self.slicing_decode(z)

        if not return_dict:
            return (decoded,)

        return DecoderOutput(sample=decoded)
    def tiled_encode(self, x: torch.Tensor, tile_size: Tuple[int, int] = (512, 512), 
                     tile_overlap: Tuple[int, int] = (64, 64)) -> torch.Tensor:
        r"""
        Encodes an input tensor `x` by splitting it into spatial tiles in latent space. Temporal is handled by `slicing_encode`.
        `tile_size` and `tile_overlap` are interpreted in output-space pixels and converted to latent-space.
        """
        # Ensure 5D [B, C, F, H, W]
        if x.ndim != 5:
            x = x.unsqueeze(2)

        b, c, f, H, W = x.shape
        tile_h, tile_w = tile_size
    
        # Only tile if input resolution requires multiple tiles
        if H <= tile_h and W <= tile_w:
            return self.slicing_encode(x)
        else:
            if self.debug:
                self.debug.log(f"Using VAE tiled encoding (Tile: {tile_size}, Overlap: {tile_overlap})", category="vae", force=True, indent_level=1)

        # Spatial scale factor (output/latent)
        scale_factor = self.spatial_downsample_factor

        # Convert output-space tiling params to latent-space
        tile_h, tile_w = tile_size
        overlap_h, overlap_w = tile_overlap
    
        latent_tile_h = max(1, tile_h // scale_factor)
        latent_tile_w = max(1, tile_w // scale_factor)
        latent_overlap_h = max(0, min((overlap_h // scale_factor), latent_tile_h - 1))
        latent_overlap_w = max(0, min((overlap_w // scale_factor), latent_tile_w - 1))

        stride_h = max(1, latent_tile_h - latent_overlap_h)
        stride_w = max(1, latent_tile_w - latent_overlap_w)

        H_lat_total = (H + scale_factor - 1) // scale_factor
        W_lat_total = (W + scale_factor - 1) // scale_factor

        result = None
        count = None

        num_tiles = ((max(H_lat_total - latent_overlap_h, 1) + stride_h - 1) // stride_h) \
                  * ((max(W_lat_total - latent_overlap_w, 1) + stride_w - 1) // stride_w)

        # Log once at start instead of per-tile
        if self.debug:
            self.debug.log(
                f"Encoding {num_tiles} tiles (Tile: {tile_size}, Overlap: {tile_overlap})",
                category="vae",
            )

        # Pre-compute common ramp values
        ramp_cache = {}
        if latent_overlap_h > 0:
            t_h = torch.linspace(0, 1, steps=latent_overlap_h, device=x.device, dtype=x.dtype)
            ramp_cache['h'] = 0.5 - 0.5 * torch.cos(t_h * torch.pi)
        if latent_overlap_w > 0:
            t_w = torch.linspace(0, 1, steps=latent_overlap_w, device=x.device, dtype=x.dtype)
            ramp_cache['w'] = 0.5 - 0.5 * torch.cos(t_w * torch.pi)

        tile_id = 0
        for y_lat in range(0, H_lat_total, stride_h):
            y_lat_end = min(y_lat + latent_tile_h, H_lat_total)
            for x_lat in range(0, W_lat_total, stride_w):
                x_lat_end = min(x_lat + latent_tile_w, W_lat_total)

                # Skip if fully within overlap of previous tiles
                if (y_lat > 0 and (y_lat_end - y_lat) <= latent_overlap_h) or \
                   (x_lat > 0 and (x_lat_end - x_lat) <= latent_overlap_w):
                    continue

                # Map latent tile to output-space crop
                y_out = y_lat * scale_factor
                x_out = x_lat * scale_factor
                y_out_end = min(y_lat_end * scale_factor, H)
                x_out_end = min(x_lat_end * scale_factor, W)

                tile_id += 1

                # Store tile boundary info for debug visualization
                if self.debug and hasattr(self.debug, 'encode_tile_boundaries'):
                    self.debug.encode_tile_boundaries.append({
                        'id': tile_id,
                        'y': y_out,
                        'x': x_out,
                        'h': y_out_end - y_out,
                        'w': x_out_end - x_out
                    })

                tile_sample = x[:, :, :, y_out:y_out_end, x_out:x_out_end]

                # Log progress periodically instead of every tile (at 1, 6, 11, 16, ...)
                if self.debug and (tile_id % 5 == 1 or tile_id == num_tiles):
                    if tile_id == num_tiles:
                        # Only log final tile if not covered by previous range
                        if (tile_id - 1) % 5 == 0:
                            self.debug.log(f"Encoding tile {tile_id} / {num_tiles}", category="vae", indent_level=1)
                    else:
                        end_tile = min(tile_id + 4, num_tiles)
                        self.debug.log(f"Encoding tiles {tile_id}-{end_tile} / {num_tiles}", category="vae", indent_level=1)

                encoded_tile = self.slicing_encode(tile_sample)

                # Initialize output size using first encoded tile
                if result is None:
                    b_out, c_out, f_lat, _, _ = encoded_tile.shape
                
                    # Accumulate on offload device if specified and different, else on inference device
                    device = getattr(self, 'tensor_offload_device', None)
                    if device is None or device == encoded_tile.device:
                        device = encoded_tile.device
                
                    result = torch.zeros(
                        (b_out, c_out, f_lat, H_lat_total, W_lat_total),
                        device=device,
                        dtype=encoded_tile.dtype,
                    )
                    count = torch.zeros((1, 1, 1, H_lat_total, W_lat_total), device=device, dtype=encoded_tile.dtype)

                eff_h_lat = min(y_lat_end - y_lat, encoded_tile.shape[3], result.shape[3] - y_lat)
                eff_w_lat = min(x_lat_end - x_lat, encoded_tile.shape[4], result.shape[4] - x_lat)

                encoded_tile = encoded_tile[:, :, : result.shape[2], :eff_h_lat, :eff_w_lat]

                # Build faded masks
                ov_h = max(0, min(latent_overlap_h, eff_h_lat - 1))
                ov_w = max(0, min(latent_overlap_w, eff_w_lat - 1))
            
                weight_h = torch.ones((eff_h_lat,), device=encoded_tile.device, dtype=encoded_tile.dtype)
                weight_w = torch.ones((eff_w_lat,), device=encoded_tile.device, dtype=encoded_tile.dtype)

                # Apply fades only on interior edges using cached ramps (avoid fading on outer image borders)
                if ov_h > 0:
                    if y_lat > 0:  # Not top edge
                        weight_h[:ov_h] = ramp_cache['h'][:ov_h]
                    if y_lat_end < H_lat_total:  # Not bottom edge
                        weight_h[-ov_h:] = 1 - ramp_cache['h'][:ov_h]
                if ov_w > 0:
                    if x_lat > 0:  # Not left edge
                        weight_w[:ov_w] = ramp_cache['w'][:ov_w]
                    if x_lat_end < W_lat_total:  # Not right edge
                        weight_w[-ov_w:] = 1 - ramp_cache['w'][:ov_w]

                # Separable application (no 2D mask to save memory)
                weight_h_5d = weight_h.view(1, 1, 1, eff_h_lat, 1)
                weight_w_5d = weight_w.view(1, 1, 1, 1, eff_w_lat)
                encoded_tile.mul_(weight_h_5d).mul_(weight_w_5d)

                # Accumulate (move to result device if different)
                if result.device != encoded_tile.device:
                    encoded_tile = encoded_tile.to(result.device)
                    weight_h_5d = weight_h_5d.to(result.device)
                    weight_w_5d = weight_w_5d.to(result.device)
            
                result[:, :, : encoded_tile.shape[2], y_lat : y_lat + eff_h_lat, x_lat : x_lat + eff_w_lat] += encoded_tile
                count[:, :, :, y_lat : y_lat + eff_h_lat, x_lat : x_lat + eff_w_lat].addcmul_(weight_h_5d, weight_w_5d)

        # Move result back to inference device if needed and normalize
        if result.device != x.device:
            result = result.to(x.device)
            count = count.to(x.device)
        result.div_(count.clamp(min=1e-6))

        if x.shape[2] == 1:  # single frame
            result = result.squeeze(2)

        return result
    def tiled_decode(self, z: torch.Tensor, tile_size: Tuple[int, int] = (512, 512), tile_overlap: Tuple[int, int] = (64, 64)) -> torch.Tensor:
        r"""
        Decodes a latent tensor `z` by splitting it into spatial tiles only. Temporal is handled by `slicing_decode`.
        """
        if z.ndim != 5:
            z = z.unsqueeze(2)

        b, c, f, H, W = z.shape

        # Spatial scale factor (output/latent)
        scale_factor = self.spatial_downsample_factor

        # Convert output-space tiling params to latent-space for spatial tiling
        tile_h, tile_w = tile_size
        overlap_h, overlap_w = tile_overlap
    
        latent_tile_h = max(1, tile_h // scale_factor)
        latent_tile_w = max(1, tile_w // scale_factor)
    
        # Only tile if latent resolution requires multiple tiles
        if H <= latent_tile_h and W <= latent_tile_w:
            return self.slicing_decode(z)
        else:
            if self.debug:
                self.debug.log(f"Using VAE tiled decoding (Tile: {tile_size}, Overlap: {tile_overlap})", category="vae", force=True, indent_level=1)
    
        latent_overlap_h = max(0, min((overlap_h // scale_factor), latent_tile_h - 1))
        latent_overlap_w = max(0, min((overlap_w // scale_factor), latent_tile_w - 1))

        stride_h = max(1, latent_tile_h - latent_overlap_h)
        stride_w = max(1, latent_tile_w - latent_overlap_w)

        # Allocate later using first decoded results
        result = None
        count = None

        num_tiles = ((max(H - latent_overlap_h, 1) + stride_h - 1) // stride_h) \
                  * ((max(W - latent_overlap_w, 1) + stride_w - 1) // stride_w)

        # Log once at start instead of per-tile
        if self.debug:
            self.debug.log(
                f"Decoding {num_tiles} tiles (Tile: {tile_size}, Overlap: {tile_overlap})",
                category="vae",
            )

        # Pre-compute common ramp values (small memory, big time save)
        ramp_cache = {}
        if overlap_h > 0:
            t_h = torch.linspace(0, 1, steps=overlap_h, device=z.device, dtype=z.dtype)
            ramp_cache['h'] = 0.5 - 0.5 * torch.cos(t_h * torch.pi)
        if overlap_w > 0:
            t_w = torch.linspace(0, 1, steps=overlap_w, device=z.device, dtype=z.dtype)
            ramp_cache['w'] = 0.5 - 0.5 * torch.cos(t_w * torch.pi)

        tile_id = 0
        for y_lat in range(0, H, stride_h):
            y_lat_end = min(y_lat + latent_tile_h, H)
            for x_lat in range(0, W, stride_w):
                x_lat_end = min(x_lat + latent_tile_w, W)

                # Skip if fully within overlap of previous tiles
                if (y_lat > 0 and (y_lat_end - y_lat) <= latent_overlap_h) or \
                   (x_lat > 0 and (x_lat_end - x_lat) <= latent_overlap_w):
                    continue

                tile_id += 1
            
                # Store tile boundary info for debug visualization
                if self.debug and hasattr(self.debug, 'decode_tile_boundaries'):
                    # Map to output space
                    y_out = y_lat * scale_factor
                    x_out = x_lat * scale_factor
                    y_out_end = y_lat_end * scale_factor
                    x_out_end = x_lat_end * scale_factor
                    self.debug.decode_tile_boundaries.append({
                        'id': tile_id,
                        'y': y_out,
                        'x': x_out,
                        'h': y_out_end - y_out,
                        'w': x_out_end - x_out
                    })
            
                tile_latent = z[:, :, :, y_lat:y_lat_end, x_lat:x_lat_end]

                # Log progress periodically instead of every tile (at 1, 6, 11, 16, ...)
                if self.debug and (tile_id % 5 == 1 or tile_id == num_tiles):
                    if tile_id == num_tiles:
                        # Only log final tile if not covered by previous range
                        if (tile_id - 1) % 5 == 0:
                            self.debug.log(f"Decoding tile {tile_id} / {num_tiles}", category="vae", indent_level=1)
                    else:
                        end_tile = min(tile_id + 4, num_tiles)
                        self.debug.log(f"Decoding tiles {tile_id}-{end_tile} / {num_tiles}", category="vae", indent_level=1)

                decoded_tile = self.slicing_decode(tile_latent)

                # Initialize result tensors using actual decoded shapes on first tile
                if result is None:
                    b_out, c_out, out_f_tile, _, _ = decoded_tile.shape
                    output_h = H * scale_factor
                    output_w = W * scale_factor
                
                    # Accumulate on offload device if specified and different, else on inference device
                    device = getattr(self, 'tensor_offload_device', None)
                    if device is None or device == decoded_tile.device:
                        device = decoded_tile.device
                
                    result = torch.zeros((b_out, c_out, out_f_tile, output_h, output_w), device=device, dtype=decoded_tile.dtype)
                    count = torch.zeros((1, 1, 1, output_h, output_w), device=device, dtype=decoded_tile.dtype)

                # Corresponding output-space placement
                y_out, y_out_end = y_lat * scale_factor, y_lat_end * scale_factor
                x_out, x_out_end = x_lat * scale_factor, x_lat_end * scale_factor

                h_out = y_out_end - y_out
                w_out = x_out_end - x_out

                # Build faded masks
                ov_h_out = max(0, min(overlap_h, h_out - 1))
                ov_w_out = max(0, min(overlap_w, w_out - 1))
            
                weight_h = torch.ones((h_out,), device=decoded_tile.device, dtype=decoded_tile.dtype)
                weight_w = torch.ones((w_out,), device=decoded_tile.device, dtype=decoded_tile.dtype)

                # Apply fades only on interior edges using cached ramps (avoid fading on outer image borders)
                if ov_h_out > 0:
                    if y_lat > 0:  # Not top edge
                        weight_h[:ov_h_out] = ramp_cache['h'][:ov_h_out]
                    if y_lat_end < H:  # Not bottom edge
                        weight_h[-ov_h_out:] = 1 - ramp_cache['h'][:ov_h_out]
                if ov_w_out > 0:
                    if x_lat > 0:  # Not left edge
                        weight_w[:ov_w_out] = ramp_cache['w'][:ov_w_out]
                    if x_lat_end < W:  # Not right edge
                        weight_w[-ov_w_out:] = 1 - ramp_cache['w'][:ov_w_out]

                # Separable application (no 2D mask to save memory)
                weight_h_5d = weight_h.view(1, 1, 1, h_out, 1)
                weight_w_5d = weight_w.view(1, 1, 1, 1, w_out)
                decoded_tile.mul_(weight_h_5d).mul_(weight_w_5d)

                # Accumulate (move to result device if different)
                if result.device != decoded_tile.device:
                    decoded_tile = decoded_tile.to(result.device)
                    weight_h_5d = weight_h_5d.to(result.device)
                    weight_w_5d = weight_w_5d.to(result.device)
            
                result[:, :, : decoded_tile.shape[2], y_out:y_out_end, x_out:x_out_end] += decoded_tile
                count[:, :, :, y_out:y_out_end, x_out:x_out_end].addcmul_(weight_h_5d, weight_w_5d)

        # Move result back to inference device if needed and normalize
        if result.device != z.device:
            result = result.to(z.device)
            count = count.to(z.device)
        result.div_(count.clamp(min=1e-6)) # In-place normalize

        if z.shape[2] == 1:  # single frame
            result = result.squeeze(2)

        return result

    VideoAutoencoderKL.encode = kl_encode
    VideoAutoencoderKL.decode = kl_decode
    VideoAutoencoderKL.tiled_encode = tiled_encode
    VideoAutoencoderKL.tiled_decode = tiled_decode

    def wrapper_encode(self, x: torch.FloatTensor, return_dict: bool = True, 
               tiled: bool = False, tile_size: Tuple[int, int] = (512, 512), 
               tile_overlap: Tuple[int, int] = (64, 64)) -> CausalEncoderOutput:
        if x.ndim == 4:
            x = x.unsqueeze(2)
        # 不能 ``super()``：方法为运行时挂到类上，无类体里的 __class__ cell
        p = VideoAutoencoderKL.encode(
            self,
            x,
            return_dict=return_dict,
            tiled=tiled,
            tile_size=tile_size,
            tile_overlap=tile_overlap,
        ).latent_dist
        # Use deterministic mode for tiled encoding to avoid artifacts
        z = p.mode().squeeze(2)
        return CausalEncoderOutput(z, p)
    def wrapper_decode(self, z: torch.Tensor, return_dict: bool = True, 
               tiled: bool = False, tile_size: Tuple[int, int] = (512, 512), 
               tile_overlap: Tuple[int, int] = (64, 64)) -> CausalDecoderOutput:
        if z.ndim == 4:
            z = z.unsqueeze(2)
        x = VideoAutoencoderKL.decode(
            self,
            z,
            return_dict=return_dict,
            tiled=tiled,
            tile_size=tile_size,
            tile_overlap=tile_overlap,
        ).sample.squeeze(2)
        return CausalDecoderOutput(x)

    VideoAutoencoderKLWrapper.encode = wrapper_encode
    VideoAutoencoderKLWrapper.decode = wrapper_decode

def bind_runner_vae_tiling(
    runner,
    *,
    tile_size: Tuple[int, int],
    tile_overlap: Tuple[int, int],
) -> None:
    """为官方 ``VideoDiffusionInfer`` 注入与 ComfyUI 一致的 ``tiled`` 编解码参数。"""
    import torch
    from einops import rearrange
    from omegaconf import ListConfig

    from common.distributed import get_device
    from models.dit_v2 import na

    ts = (int(tile_size[0]), int(tile_size[1]))
    to = (int(tile_overlap[0]), int(tile_overlap[1]))

    @torch.no_grad()
    def vae_encode(samples):
        use_sample = runner.config.vae.get("use_sample", True)
        latents = []
        if len(samples) > 0:
            device = get_device()
            dtype = getattr(torch, runner.config.vae.dtype)
            scale = runner.config.vae.scaling_factor
            shift = runner.config.vae.get("shifting_factor", 0.0)
            if isinstance(scale, ListConfig):
                scale = torch.tensor(scale, device=device, dtype=dtype)
            if isinstance(shift, ListConfig):
                shift = torch.tensor(shift, device=device, dtype=dtype)
            if runner.config.vae.grouping:
                batches, indices = na.pack(samples)
            else:
                batches = [sample.unsqueeze(0) for sample in samples]
            for sample in batches:
                sample = sample.to(device, dtype)
                if hasattr(runner.vae, "preprocess"):
                    sample = runner.vae.preprocess(sample)
                if use_sample:
                    latent = runner.vae.encode(
                        sample,
                        tiled=True,
                        tile_size=ts,
                        tile_overlap=to,
                    ).latent
                else:
                    latent = (
                        runner.vae.encode(
                            sample,
                            tiled=True,
                            tile_size=ts,
                            tile_overlap=to,
                        )
                        .posterior.mode()
                        .squeeze(2)
                    )
                latent = latent.unsqueeze(2) if latent.ndim == 4 else latent
                latent = rearrange(latent, "b c ... -> b ... c")
                latent = (latent - shift) * scale
                latents.append(latent)
            if runner.config.vae.grouping:
                latents = na.unpack(latents, indices)
            else:
                latents = [latent.squeeze(0) for latent in latents]
        return latents

    @torch.no_grad()
    def vae_decode(latents):
        samples = []
        if len(latents) > 0:
            device = get_device()
            dtype = getattr(torch, runner.config.vae.dtype)
            scale = runner.config.vae.scaling_factor
            shift = runner.config.vae.get("shifting_factor", 0.0)
            if isinstance(scale, ListConfig):
                scale = torch.tensor(scale, device=device, dtype=dtype)
            if isinstance(shift, ListConfig):
                shift = torch.tensor(shift, device=device, dtype=dtype)
            if runner.config.vae.grouping:
                latents, indices = na.pack(latents)
            else:
                latents = [latent.unsqueeze(0) for latent in latents]
            for latent in latents:
                latent = latent.to(device, dtype)
                latent = latent / scale + shift
                latent = rearrange(latent, "b ... c -> b c ...")
                latent = latent.squeeze(2)
                sample = runner.vae.decode(
                    latent,
                    tiled=True,
                    tile_size=ts,
                    tile_overlap=to,
                ).sample
                if hasattr(runner.vae, "postprocess"):
                    sample = runner.vae.postprocess(sample)
                samples.append(sample)
            if runner.config.vae.grouping:
                samples = na.unpack(samples, indices)
            else:
                samples = [sample.squeeze(0) for sample in samples]
        return samples

    runner.vae_encode = vae_encode
    runner.vae_decode = vae_decode


def _apply_torch_compile_runner(runner) -> None:
    """与 Comfy ``SeedVR2TorchCompileSettings`` 对齐：可选 inductor 编译 DiT/VAE（首几次推理可能很慢）。"""
    import torch

    flag = os.environ.get("SEEDVR2_TORCH_COMPILE", "0").strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        return
    backend = os.environ.get("SEEDVR2_TORCH_COMPILE_BACKEND", "inductor").strip() or "inductor"
    mode = os.environ.get("SEEDVR2_TORCH_COMPILE_MODE", "default").strip() or "default"
    dynamic = os.environ.get("SEEDVR2_TORCH_COMPILE_DYNAMIC", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    _sr_log(
        f"torch.compile: backend={backend!r} mode={mode!r} dynamic={dynamic} "
        "(first batches can take a long time compiling)"
    )
    compile_kw = {"backend": backend, "mode": mode, "dynamic": dynamic}
    try:
        runner.dit = torch.compile(runner.dit, **compile_kw)
    except Exception as e:
        _sr_log(f"torch.compile DiT failed, keeping eager: {e}")
    try:
        runner.vae = torch.compile(runner.vae, **compile_kw)
    except Exception as e:
        _sr_log(f"torch.compile VAE failed, keeping eager: {e}")


# ── app ──────────────────────────────────────────────────────────────────────

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("pytorch/pytorch:2.5.1-cuda12.4-cudnn9-devel")
    .apt_install("git", "ffmpeg", "libsm6", "libxext6")
    .run_commands(f"git clone --depth 1 {SEEDVR_GIT} {SEEDVR_ROOT}")
    .pip_install(
        "einops==0.7.0",
        "omegaconf==2.3.0",
        "diffusers==0.29.1",
        "transformers==4.38.2",
        "rotary-embedding-torch==0.5.3",
        "mediapy==1.2.0",
        "opencv-python-headless>=4.9.0",
        "av>=12.0",
        "pillow>=10.0",
        "tqdm",
        "flash-attn>=2.5.0",
    )
    .env(
        {
            "PYTHONPATH": SEEDVR_ROOT,
            # Modal 部分环境不支持 expandable_segments，会刷屏告警；不设置 allocator 扩展项
            "TOKENIZERS_PARALLELISM": "false",
        }
    )
    # LAB 色校（与 ComfyUI-SeedVR2 同源逻辑）；与入口脚本同目录打包到 /root 供 import
    .add_local_file(
        Path(__file__).resolve().parent / "color_fix_lab.py",
        "/root/color_fix_lab.py",
    )
)


def _patch_config_norms_no_apex(config) -> None:
    """将 config 中的 fused norm 替换为标准 norm，避免依赖 Apex。

    直接修改 config 而非 monkey-patch ``get_norm_layer``：配置层面设定
    ``"rms"`` / ``"layer"`` 更可靠（参考 Render-AI-Code/cog-seed-vr-2）。
    """
    dit_model = config.dit.model
    _FUSED_MAP = {"fusedrms": "rms", "fusedln": "layer"}
    for attr in ("norm", "vid_out_norm", "txt_in_norm", "qk_norm"):
        if hasattr(dit_model, attr):
            val = getattr(dit_model, attr)
            if val in _FUSED_MAP:
                setattr(dit_model, attr, _FUSED_MAP[val])


def _ensure_dist_env() -> None:
    os.environ.setdefault("MASTER_ADDR", "127.0.0.1")
    os.environ.setdefault("MASTER_PORT", "29500")
    os.environ.setdefault("RANK", "0")
    os.environ.setdefault("LOCAL_RANK", "0")
    os.environ.setdefault("WORLD_SIZE", "1")


def _quiet_known_third_party_warnings() -> None:
    """压低 rotary / diffusers / torch.load 等已知且与本服务无关的告警刷屏。"""
    import warnings

    patterns = (
        r".*torch\.cuda\.amp\.autocast.*",
        r".*weights_only.*",
        r".*Transformer2DModelOutput.*",
    )
    for msg in patterns:
        warnings.filterwarnings("ignore", message=msg, category=FutureWarning)
        warnings.filterwarnings("ignore", message=msg, category=UserWarning)


def _load_pt_weights(path: str, *, map_location, mmap: bool = False):
    """``.pt`` 嵌入多为纯张量，优先 ``weights_only=True`` 以消除安全 FutureWarning。"""
    import torch

    try:
        return torch.load(
            path, map_location=map_location, mmap=mmap, weights_only=True
        )
    except Exception:
        return torch.load(
            path, map_location=map_location, mmap=mmap, weights_only=False
        )


@app.cls(
    image=image,
    gpu="A100-80GB",
    volumes={"/models": volume},
    timeout=3600,
)
class Inference:
    @modal.enter()
    def load(self) -> None:
        import datetime
        import gc

        import torch
        from omegaconf import OmegaConf

        _quiet_known_third_party_warnings()
        _ensure_dist_env()
        # ``color_fix_lab`` 与入口脚本一并置于 ``/root``，保证 LAB 色校可 import
        _modal_root = "/root"
        if _modal_root not in sys.path:
            sys.path.insert(0, _modal_root)
        os.chdir(SEEDVR_ROOT)
        if SEEDVR_ROOT not in sys.path:
            sys.path.insert(0, SEEDVR_ROOT)

        from common.config import load_config
        from common.distributed import init_torch
        from common.distributed.advanced import init_sequence_parallel
        from common.seed import set_seed
        from projects.video_diffusion_sr.infer import VideoDiffusionInfer

        _use_vae_tiling = os.environ.get("SEEDVR2_VAE_TILING", "1").strip().lower() not in (
            "0",
            "false",
            "no",
        )
        if _use_vae_tiling:
            from models.video_vae_v3.modules.attn_video_vae import (
                VideoAutoencoderKL,
                VideoAutoencoderKLWrapper,
            )

            patch_vae_classes(VideoAutoencoderKL, VideoAutoencoderKLWrapper)

        def _configure_sequence_parallel(sp_size: int) -> None:
            if sp_size > 1:
                init_sequence_parallel(sp_size)

        global DIT_CKPT

        model_size = _norm_model_size(os.environ.get("SEEDVR2_MODEL_SIZE"))
        DIT_CKPT = _dit_ckpt_for_size(model_size)
        self._model_size = model_size

        weight_dir = MODEL_DIR_3B if model_size == "3b" else MODEL_DIR_7B
        emb_dir = MODEL_DIR_3B

        ckpt_dir = os.path.join(SEEDVR_ROOT, "ckpts")
        os.makedirs(ckpt_dir, exist_ok=True)
        _need_names = sorted({*DIT_CKPT.values(), "ema_vae.pth"})
        for name in _need_names:
            src = os.path.join(weight_dir, name)
            dst = os.path.join(ckpt_dir, name)
            if os.path.isfile(dst):
                continue
            if os.path.isfile(src):
                os.symlink(src, dst)
            elif name == DIT_CKPT["sharp"]:
                pass
            else:
                raise FileNotFoundError(
                    f"Missing {src}. Run `modal run gpu/seedvr2.py::download` first."
                )

        pos_path = os.path.join(emb_dir, "pos_emb.pt")
        neg_path = os.path.join(emb_dir, "neg_emb.pt")
        if not (os.path.isfile(pos_path) and os.path.isfile(neg_path)):
            raise FileNotFoundError(
                f"Missing text embeddings in {emb_dir}. Run download first."
            )
        self._pos_emb = _load_pt_weights(pos_path, map_location="cpu")
        self._neg_emb = _load_pt_weights(neg_path, map_location="cpu")

        config_path = os.path.join(SEEDVR_ROOT, f"configs_{model_size}", "main.yaml")
        config = load_config(config_path)
        runner = VideoDiffusionInfer(config)
        OmegaConf.set_readonly(runner.config, False)

        # 在构建模型前将 fused norm 替换为标准 norm（避免 Apex 依赖）
        _patch_config_norms_no_apex(runner.config)

        if torch.cuda.is_available():
            torch.cuda.set_device(0)

        init_torch(cudnn_benchmark=False, timeout=datetime.timedelta(seconds=3600))
        _configure_sequence_parallel(1)

        self._dit_ckpt_paths = {
            k: os.path.join(ckpt_dir, v) for k, v in DIT_CKPT.items()
        }
        init_variant = os.environ.get("SEEDVR2_DIT_VARIANT", "sharp").lower()
        if init_variant not in DIT_CKPT:
            init_variant = "sharp"
        _init_ckpt = self._dit_ckpt_paths[init_variant]
        if not os.path.isfile(_init_ckpt):
            if init_variant == "sharp":
                init_variant = "ema"
                _init_ckpt = self._dit_ckpt_paths["ema"]
            else:
                raise FileNotFoundError(
                    f"Missing DiT checkpoint {_init_ckpt}. Run download first."
                )
        runner.configure_dit_model(device="cuda", checkpoint=_init_ckpt)
        self._dit_variant_loaded: str = init_variant
        runner.configure_vae_model()
        if _use_vae_tiling:
            _ts = int(os.environ.get("SEEDVR2_VAE_TILE_SIZE", "1024"))
            _ov = int(os.environ.get("SEEDVR2_VAE_TILE_OVERLAP", "128"))
            bind_runner_vae_tiling(
                runner,
                tile_size=(_ts, _ts),
                tile_overlap=(_ov, _ov),
            )
        if hasattr(runner.vae, "set_memory_limit"):
            runner.vae.set_memory_limit(**runner.config.vae.memory_limit)

        # 与官方 7B 推理脚本中 ``generation_loop`` 默认一致（单步、cfg scale 1）
        runner.config.diffusion.cfg.scale = 1.0
        runner.config.diffusion.cfg.rescale = 0.0
        runner.config.diffusion.timesteps.sampling.steps = 1
        runner.configure_diffusion()

        _apply_torch_compile_runner(runner)

        self._runner = runner
        self._set_seed = set_seed
        gc.collect()
        torch.cuda.empty_cache()
        volume.commit()

    def _ensure_dit_variant(self, variant: str) -> None:
        """热切换 DiT 权重（ema / sharp），与 ComfyUI 节点可选 sharp 对齐。"""
        import gc

        import torch

        if variant not in DIT_CKPT:
            variant = "ema"
        if getattr(self, "_dit_variant_loaded", None) == variant:
            return
        path = self._dit_ckpt_paths[variant]
        if not os.path.isfile(path):
            raise FileNotFoundError(
                f"DiT checkpoint not found: {path}. "
                f"Ensure `modal run gpu/seedvr2.py::download` pulled {DIT_CKPT[variant]}."
            )
        state = torch.load(path, map_location="cpu", mmap=True)
        self._runner.dit.load_state_dict(state, strict=True, assign=True)
        del state
        if torch.cuda.is_available():
            self._runner.dit.to(torch.device("cuda"))
        self._dit_variant_loaded = variant
        gc.collect()
        torch.cuda.empty_cache()

    def _dit_sample(self, text_embeds_dict, cond_latents, cond_noise_scale: float = 0.0):
        """DiT 采样，只返回 **latent**（不做 VAE decode）。

        参照 ComfyUI-SeedVR2_VideoUpscaler 将 DiT 推理与 VAE 解码分离，
        避免 ``runner.inference()`` 内部在 autocast 上下文中隐式解码
        导致精度 / 设备管理不一致。
        """
        import torch

        from common.diffusion import classifier_free_guidance_dispatcher
        from common.distributed import get_device
        from common.distributed.ops import sync_data
        from models.dit_v2 import na

        runner = self._runner

        def _move_to_cuda(x):
            return [i.to(get_device()) for i in x]

        noises = [torch.randn_like(latent) for latent in cond_latents]
        aug_noises = [torch.randn_like(latent) for latent in cond_latents]
        noises, aug_noises, cond_latents = sync_data((noises, aug_noises, cond_latents), 0)
        noises, aug_noises, cond_latents = list(
            map(lambda x: _move_to_cuda(x), (noises, aug_noises, cond_latents))
        )

        def _add_noise(x, aug_noise):
            if cond_noise_scale == 0.0:
                return x
            t = torch.tensor([1000.0], device=get_device()) * cond_noise_scale
            shape = torch.tensor(x.shape[1:], device=get_device())[None]
            t = runner.timestep_transform(t, shape)
            x = runner.schedule.forward(x, aug_noise, t)
            return x

        conditions = [
            runner.get_condition(
                noise,
                task="sr",
                latent_blur=_add_noise(latent_blur, aug_noise),
            )
            for noise, aug_noise, latent_blur in zip(noises, aug_noises, cond_latents)
        ]

        # ── 文本 embedding ──
        texts_pos = text_embeds_dict["texts_pos"]
        texts_neg = text_embeds_dict["texts_neg"]
        text_pos_embeds, text_pos_shapes = na.flatten(texts_pos)
        text_neg_embeds, text_neg_shapes = na.flatten(texts_neg)

        # ── flatten ──
        latents, latents_shapes = na.flatten(noises)
        latents_cond, _ = na.flatten(conditions)
        batch_size = len(noises)

        cfg_scale = runner.config.diffusion.cfg.scale

        was_training = runner.dit.training
        runner.dit.eval()

        with torch.no_grad(), torch.autocast("cuda", torch.bfloat16, enabled=True):
            latents = runner.sampler.sample(
                x=latents,
                f=lambda args: classifier_free_guidance_dispatcher(
                    pos=lambda: runner.dit(
                        vid=torch.cat([args.x_t, latents_cond], dim=-1),
                        txt=text_pos_embeds,
                        vid_shape=latents_shapes,
                        txt_shape=text_pos_shapes,
                        timestep=args.t.repeat(batch_size),
                    ).vid_sample,
                    neg=lambda: runner.dit(
                        vid=torch.cat([args.x_t, latents_cond], dim=-1),
                        txt=text_neg_embeds,
                        vid_shape=latents_shapes,
                        txt_shape=text_neg_shapes,
                        timestep=args.t.repeat(batch_size),
                    ).vid_sample,
                    scale=(
                        cfg_scale
                        if (args.i + 1) / len(runner.sampler.timesteps)
                        <= runner.config.diffusion.cfg.get("partial", 1)
                        else 1.0
                    ),
                    rescale=runner.config.diffusion.cfg.rescale,
                ),
            )

        runner.dit.train(was_training)

        # unflatten → 返回 latent list
        latents = na.unflatten(latents, latents_shapes)
        del latents_cond
        return latents

    def _cut_videos(self, videos: "torch.Tensor", sp_size: int) -> "torch.Tensor":
        import torch

        t = videos.size(1)
        if t == 1:
            return videos
        if t <= 4 * sp_size:
            padding = [videos[:, -1].unsqueeze(1)] * (4 * sp_size - t + 1)
            padding = torch.cat(padding, dim=1)
            return torch.cat([videos, padding], dim=1)
        if (t - 1) % (4 * sp_size) == 0:
            return videos
        padding = [videos[:, -1].unsqueeze(1)] * (
            4 * sp_size - ((t - 1) % (4 * sp_size))
        )
        padding = torch.cat(padding, dim=1)
        out = torch.cat([videos, padding], dim=1)
        assert (out.size(1) - 1) % (4 * sp_size) == 0
        return out

    def _run_sr(
        self,
        video_tchw: "torch.Tensor",
        fps: Optional[float],
        short_edge_px: int,
        max_edge_px: int,
        seed: int,
        *,
        dit_variant: Literal["ema", "sharp"] = "sharp",
        color_correction: Literal["lab", "none"] = "lab",
        batch_size: int = DEFAULT_VIDEO_BATCH_SIZE,
        uniform_batch_size: bool = DEFAULT_UNIFORM_BATCH_SIZE,
        temporal_overlap: int = DEFAULT_TEMPORAL_OVERLAP,
    ) -> "torch.Tensor":
        """输入 ``TCHW`` float 0–1，返回 ``T H W C`` uint8 CPU。

        与 ComfyUI-SeedVR2 一致：按批 **encode → DiT → decode**（``batch_size`` 为 ``4n+1``），
        降低显存峰值；可选 ``temporal_overlap`` 块间混合。预处理与 Comfy ``prepare_video_transforms`` 对齐。
        """
        import gc

        import torch
        from einops import rearrange
        from torchvision.transforms import Normalize

        gc.collect()
        torch.cuda.empty_cache()

        from common.distributed import get_device

        _t_run = time.perf_counter()
        bs = _norm_batch_size_4n1(batch_size)
        ov = max(0, int(temporal_overlap))
        if ov >= bs:
            _sr_log("temporal_overlap >= batch_size; using overlap=0")
            ov = 0

        _in_t, _in_h, _in_w = int(video_tchw.size(0)), int(video_tchw.size(2)), int(
            video_tchw.size(3)
        )
        _sr_log(
            f"_run_sr: input TCHW=({_in_t},{video_tchw.size(1)},{_in_h},{_in_w}) "
            f"short_edge={short_edge_px} max_edge={max_edge_px} dit={dit_variant} "
            f"color={color_correction} batch_size={bs} uniform={uniform_batch_size} overlap={ov}"
        )
        if color_correction == "lab":
            _le = _parse_lab_max_edge()
            if _le > 0:
                _sr_log(
                    f"LAB: internal max_edge={_le}px (SEEDVR2_LAB_MAX_EDGE; use 0 for full-res, slower)"
                )
            else:
                _sr_log(
                    "LAB: full resolution (SEEDVR2_LAB_MAX_EDGE=0) — expect long per-batch time at 4K"
                )

        self._ensure_dit_variant(dit_variant)
        runner = self._runner

        resized = _side_resize_tchw(video_tchw, short_edge_px, max_edge_px)
        true_h, true_w = _true_hw_even(resized)
        ref_rgb = resized.clone()
        del resized
        total_frames = int(ref_rgb.shape[0])
        ranges = _iter_batch_ranges(total_frames, bs, ov)
        if not ranges:
            raise ValueError("no frames to process")
        _sr_log(
            f"Batched SR: {len(ranges)} batch(es) for {total_frames} frames "
            f"(step={bs - ov if ov > 0 else bs})"
        )

        normalize = Normalize(0.5, 0.5)

        # Comfy：整段 Phase1 前 VAE 编码用 seed+1_000_000 一次
        self._set_seed(seed + 1_000_000, same_across_ranks=True)

        chunks_cthw: list[torch.Tensor] = []
        thwc_float_parts: list[torch.Tensor] = []

        for bi, (start_idx, end_idx) in enumerate(ranges):
            ori_length = end_idx - start_idx
            batch_tchw = ref_rgb[start_idx:end_idx].clone()
            if uniform_batch_size and ori_length < bs:
                batch_tchw = _pad_tchw_repeat_last(batch_tchw, bs - ori_length)
            n4 = _frames_pad_to_4n1(batch_tchw.shape[0])
            if n4 > 0:
                batch_tchw = _pad_tchw_repeat_last(batch_tchw, n4)

            padded = _divisible_pad_tchw(batch_tchw)
            del batch_tchw
            padded = normalize(padded.to(get_device()))
            cond_latents = [self._cut_videos(padded.permute(1, 0, 2, 3), 1)]
            del padded

            _sr_log(
                f"Batch {bi + 1}/{len(ranges)}: encode→DiT→decode "
                f"(frames {start_idx}:{end_idx}, ori_len={ori_length})…"
            )
            _t_batch = time.perf_counter()

            runner.dit.to("cpu")
            runner.vae.to(get_device())
            cond_latents = runner.vae_encode(cond_latents)
            _tensor_offload = os.environ.get(
                "SEEDVR2_TENSOR_OFFLOAD", "1"
            ).strip().lower() not in ("0", "false", "no", "off")
            if _tensor_offload:
                cond_latents = [x.cpu() for x in cond_latents]
            runner.vae.to("cpu")

            self._set_seed(seed, same_across_ranks=True)
            runner.dit.to(get_device())
            text_embeds = {
                "texts_pos": [self._pos_emb.to(get_device())],
                "texts_neg": [self._neg_emb.to(get_device())],
            }
            upscaled_latents = self._dit_sample(
                text_embeds,
                cond_latents=cond_latents,
                cond_noise_scale=COND_NOISE_SCALE,
            )
            runner.dit.to("cpu")
            del cond_latents

            runner.vae.to(get_device())
            with torch.no_grad():
                samples = runner.vae_decode(upscaled_latents)
            runner.vae.to("cpu")
            del upscaled_latents

            sample = samples[0]
            del samples
            sample = _trim_decode_sample_cthw(sample, ori_length, true_h, true_w)

            ref_slice = ref_rgb[start_idx:end_idx]

            if color_correction == "lab":
                if ov == 0:
                    _tl = time.perf_counter()
                    sample = _lab_cthw_pair(sample, ref_slice)
                    _sr_log(f"Batch {bi + 1}: LAB done in {time.perf_counter() - _tl:.1f}s")
                else:
                    _sr_log(
                        f"Batch {bi + 1}: LAB deferred until full stitch (temporal_overlap={ov})"
                    )
            if ov == 0:
                chunks_cthw.append(sample)
            else:
                if sample.ndim == 4:
                    thwc_float_parts.append(
                        rearrange(sample, "c t h w -> t h w c")
                    )
                else:
                    thwc_float_parts.append(rearrange(sample, "c h w -> 1 h w c"))

            del sample
            gc.collect()
            torch.cuda.empty_cache()
            _sr_log(
                f"Batch {bi + 1}/{len(ranges)} done in {time.perf_counter() - _t_batch:.1f}s"
            )

        if ov == 0:
            full_cthw = torch.cat(chunks_cthw, dim=1)
            del chunks_cthw
            sample = full_cthw
        else:
            stitched = _stitch_thwc_batches(thwc_float_parts, ov)
            del thwc_float_parts
            sample = rearrange(stitched, "t h w c -> c t h w")
            if color_correction == "lab":
                _sr_log("LAB color correction (full stitched, overlap>0)…")
                _tl = time.perf_counter()
                sample = _lab_cthw_pair(sample, ref_rgb)
                _sr_log(f"LAB done in {time.perf_counter() - _tl:.1f}s")

        del ref_rgb

        sample = (
            rearrange(sample[:, None], "c t h w -> t h w c")
            if sample.ndim == 3
            else rearrange(sample, "c t h w -> t h w c")
        )
        sample = sample.clip(-1, 1).mul_(0.5).add_(0.5).mul_(255).round()
        sample = sample.to(torch.uint8)
        gc.collect()
        torch.cuda.empty_cache()
        _sr_log(f"_run_sr: finished in {time.perf_counter() - _t_run:.1f}s total")
        return sample

    @modal.method()
    def upsample_image(
        self,
        image: bytes,
        resolution: Literal["1k", "2k", "4k"] = "2k",
        seed: int = DEFAULT_SEED,
        dit_variant: Literal["ema", "sharp"] = "sharp",
        color_correction: Literal["lab", "none"] = "lab",
    ) -> bytes:
        """
        图像超分：单帧走与视频相同的 SR 管线（``T=1``）。

        缩放与 ComfyUI SeedVR2 节点一致：最短边 + max_edge（见模块文档 ``TIER_COMFY_RESOLUTION``）。

        Args:
            image: PNG / JPEG 等 ``read_image`` 支持的格式。
            resolution: ``1k`` / ``2k`` / ``4k`` 档位。
            seed: 随机种子。
            dit_variant: ``sharp``（默认，与常见 Comfy 工作流一致）或 ``ema``（更柔和）。
            color_correction: ``lab``（默认，与节点默认一致）或 ``none``。
        """
        from PIL import Image
        from torchvision.io import read_image

        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        try:
            tmp.write(image)
            tmp.flush()
            path = tmp.name
            vid = read_image(path).unsqueeze(0) / 255.0
        finally:
            tmp.close()
            try:
                os.unlink(path)
            except OSError:
                pass

        if vid.numel() == 0:
            raise ValueError("Empty image")

        short_e, max_e = _tier_to_short_and_max_edge(resolution)
        dv = _norm_dit_variant(dit_variant)
        cc = _norm_color_correction(color_correction)
        out = self._run_sr(
            vid,
            fps=None,
            short_edge_px=short_e,
            max_edge_px=max_e,
            seed=seed,
            dit_variant=dv,
            color_correction=cc,
        )
        arr = out.squeeze(0).numpy()
        # PIL: 灰度需 2D；H×W×1 会触发 TypeError: (…, |u1)
        if arr.ndim == 3 and arr.shape[-1] == 1:
            arr = arr[..., 0]
        pil = Image.fromarray(arr)
        buf = io.BytesIO()
        pil.save(buf, format="PNG")
        return buf.getvalue()

    @modal.method()
    def upsample_video(
        self,
        video: bytes,
        resolution: Literal["1k", "2k", "4k"] = "2k",
        seed: int = DEFAULT_SEED,
        out_fps: Optional[float] = None,
        dit_variant: Literal["ema", "sharp"] = "sharp",
        color_correction: Literal["lab", "none"] = "lab",
        batch_size: int = DEFAULT_VIDEO_BATCH_SIZE,
        uniform_batch_size: bool = DEFAULT_UNIFORM_BATCH_SIZE,
        temporal_overlap: int = DEFAULT_TEMPORAL_OVERLAP,
    ) -> bytes:
        """
        视频超分。

        缩放语义与 ComfyUI 一致（最短边 + max_edge，见模块文档）。
        按批 **encode → DiT → decode**（与 ComfyUI-SeedVR2 一致），显存峰值由单批帧数决定。

        Args:
            video: MP4 等 ``read_video`` 可读格式。
            resolution: ``1k`` / ``2k`` / ``4k`` 档位。
            seed: 随机种子。
            out_fps: 输出帧率；默认与源视频一致。
            dit_variant: ``sharp``（默认）或 ``ema``。
            color_correction: ``lab`` 或 ``none``。
            batch_size: 每批帧数，会规范为 **4n+1**（如 1, 5, 9, 33…）；默认 **33**（与 ``SeedVR2_HD_video_upscale`` 一致）；显存紧用 **1** 或 **5**。
            uniform_batch_size: 是否将最后一批用末帧垫满 ``batch_size``；默认 **True**。
            temporal_overlap: 批次间重叠帧数；默认 **3**（与 HD 示例一致）；需小于 ``batch_size``。
        """
        import mediapy
        from torchvision.io.video import read_video

        tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        try:
            tmp.write(video)
            tmp.flush()
            path = tmp.name
            vid, _, info = read_video(
                path, output_format="TCHW", pts_unit="sec"
            )
        finally:
            tmp.close()
            try:
                os.unlink(path)
            except OSError:
                pass

        vid = vid.float() / 255.0
        fps = float(out_fps) if out_fps is not None else float(info["video_fps"])
        _sr_log(
            f"upsample_video: decoded TCHW={tuple(vid.shape)} fps={fps:.3f} "
            f"({vid.shape[0]} frames); starting preprocess + SR…"
        )

        short_e, max_e = _tier_to_short_and_max_edge(resolution)
        dv = _norm_dit_variant(dit_variant)
        cc = _norm_color_correction(color_correction)
        out = self._run_sr(
            vid,
            fps=fps,
            short_edge_px=short_e,
            max_edge_px=max_e,
            seed=seed,
            dit_variant=dv,
            color_correction=cc,
            batch_size=batch_size,
            uniform_batch_size=uniform_batch_size,
            temporal_overlap=temporal_overlap,
        )
        out_np = out.numpy()

        out_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        try:
            out_path = out_tmp.name
            out_tmp.close()
            mediapy.write_video(out_path, out_np, fps=fps)
            with open(out_path, "rb") as f:
                return f.read()
        finally:
            try:
                os.unlink(out_path)
            except OSError:
                pass


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
def _download() -> None:
    import os

    from huggingface_hub import snapshot_download

    token = os.environ.get("HF_TOKEN")
    _patterns = ["*.pth", "*.pt", "*.json", "*.md", "*.txt"]
    for repo_id in (HF_REPO_3B, HF_REPO_7B):
        local_dir = f"/models/{repo_id}"
        os.makedirs(local_dir, exist_ok=True)
        snapshot_download(
            repo_id=repo_id,
            local_dir=local_dir,
            token=token,
            local_dir_use_symlinks=False,
            allow_patterns=_patterns,
        )
    volume.commit()


@model_downloader.local_entrypoint()
def download() -> None:
    _download.remote()
