from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class ImageDescribeInput(TypedDict, total=False):
    image: Required[Asset]
    text: str
    userPrompt: str

class ImageDescribeOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

