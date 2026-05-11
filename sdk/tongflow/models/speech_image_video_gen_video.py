from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class SpeechImageVideoGenVideoInput(TypedDict, total=False):
    audio: Required[Asset]
    image: Required[Asset]
    text: str
    video: Required[Asset]

class SpeechImageVideoGenVideoOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

