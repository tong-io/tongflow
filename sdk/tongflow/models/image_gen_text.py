from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class ImageGenTextInput(TypedDict, total=False):
    enable_thinking: bool
    image_base64: str
    image_base64s: list[str]
    images: list[str]
    max_new_tokens: int
    system: str
    temperature: float
    text: Required[str]
    texts: list[str]
    top_k: int
    top_p: float

class ImageGenTextOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

