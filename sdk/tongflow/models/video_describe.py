from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class VideoDescribeInput(TypedDict, total=False):
    text: str
    userPrompt: str
    video: str

class VideoDescribeOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

