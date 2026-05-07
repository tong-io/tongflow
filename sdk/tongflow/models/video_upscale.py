from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class VideoUpscaleInput(TypedDict, total=False):
    batch_size: int
    color_correction: str
    dit_variant: str
    image_base64: str
    out_fps: float
    resolution: str
    seed: int
    temporal_overlap: int
    uniform_batch_size: bool
    video_base64: Required[str]

class VideoUpscaleOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

