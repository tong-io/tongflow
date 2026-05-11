from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class ImageUpscaleInput(TypedDict, total=False):
    batch_size: int
    color_correction: str
    dit_variant: str
    image: Required[Asset]
    out_fps: float
    resolution: str
    seed: int
    temporal_overlap: int
    uniform_batch_size: bool
    video: Asset

class ImageUpscaleOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

