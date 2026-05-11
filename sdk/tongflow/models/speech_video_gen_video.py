from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class SpeechVideoGenVideoInput(TypedDict, total=False):
    audio: Required[Asset]
    video: Required[Asset]

class SpeechVideoGenVideoOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

