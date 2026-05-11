from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class VideoUpscaleInput(TypedDict, total=False):
    batch_size: int
    color_correction: str
    dit_variant: str
    image: Asset
    out_fps: float
    resolution: str
    seed: int
    temporal_overlap: int
    uniform_batch_size: bool
    video: Required[Asset]

class VideoUpscaleOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

