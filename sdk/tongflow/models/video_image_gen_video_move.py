from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class VideoImageGenVideoMoveInput(TypedDict, total=False):
    image: Required[str]
    text: str
    video: Required[str]

class VideoImageGenVideoMoveOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

