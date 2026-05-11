from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class LinkInput(TypedDict, total=False):
    url: Required[str]

class LinkOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

