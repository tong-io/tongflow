from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class ImageFusionInput(TypedDict, total=False):
    height: int
    image: Asset
    image2: Asset
    images: list[Asset]
    seed: int
    text: Required[str]
    width: int

class ImageFusionOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

