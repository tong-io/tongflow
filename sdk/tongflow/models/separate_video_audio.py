from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class SeparateVideoAudioInput(TypedDict, total=False):
    video: Required[Asset]

class SeparateVideoAudioOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    success: Required[bool]
    text: str
    thinking: str
    video: VideoRef

