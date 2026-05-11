from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class AudioImageGenVideoInput(TypedDict, total=False):
    audio: Required[Asset]
    image: Required[Asset]
    text: str

class AudioImageGenVideoOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

