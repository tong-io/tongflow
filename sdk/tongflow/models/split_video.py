from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class SplitVideoInput(TypedDict, total=False):
    fileKey: str
    video: Asset
    videoKey: str
    video_base64: str
    video_bytes: str

class SplitVideoOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef
    video_parts: list[FileRef]

