from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class ConcatVideosInput(TypedDict, total=False):
    fileKeys: list[str]
    filenames: list[str]
    videos_bytes: Required[list[str]]

class ConcatVideosOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

