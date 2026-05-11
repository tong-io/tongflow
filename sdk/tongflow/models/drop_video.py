from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class DropVideoInput(TypedDict, total=False):
    query: str
    videos: Required[list[Asset]]

class DropVideoOutput(TypedDict, total=False):
    audio: AudioRef
    clips: list[VideoRef]
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

