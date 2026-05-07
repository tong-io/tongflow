from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class ImageEditInput(TypedDict, total=False):
    height: int
    image_base64: Required[str]
    match_input_size: bool
    seed: int
    text: Required[str]
    width: int

class ImageEditOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

