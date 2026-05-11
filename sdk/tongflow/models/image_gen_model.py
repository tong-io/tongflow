from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class ImageGenModelInput(TypedDict, total=False):
    guidance_scale: float
    height: int
    image: Required[Asset]
    num_inference_steps: int
    seed: int
    text: str
    texts: list[str]
    width: int

class ImageGenModelOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

