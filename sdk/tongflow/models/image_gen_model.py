from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class ImageGenModelInput(TypedDict, total=False):
    guidance_scale: float
    height: int
    num_inference_steps: int
    seed: int
    text: str
    texts: list[str]
    width: int

class ImageGenModelOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

