from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class ImageEditInput(TypedDict, total=False):
    height: int
    image: Required[Asset]
    match_input_size: bool
    seed: int
    text: Required[str]
    width: int

class ImageEditOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

