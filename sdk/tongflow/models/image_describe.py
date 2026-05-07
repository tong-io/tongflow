from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class ImageDescribeInput(TypedDict, total=False):
    image: str
    text: str
    userPrompt: str

class ImageDescribeOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

