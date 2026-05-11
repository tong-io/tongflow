from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class ExtractAudioInput(TypedDict, total=False):
    video: Required[Asset]

class ExtractAudioOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

