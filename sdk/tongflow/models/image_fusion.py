from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class ImageFusionInput(TypedDict, total=False):
    height: int
    image2_base64: str
    image_base64: str
    images: list[str]
    seed: int
    text: Required[str]
    width: int

class ImageFusionOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

