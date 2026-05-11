from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class VideoGenTextInput(TypedDict, total=False):
    enable_thinking: bool
    image: Asset
    images: list[Asset]
    max_new_tokens: int
    system: str
    temperature: float
    text: Required[str]
    texts: list[str]
    top_k: int
    top_p: float
    video: Required[Asset]

class VideoGenTextOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

