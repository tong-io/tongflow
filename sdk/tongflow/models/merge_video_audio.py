from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class MergeVideoAudioInput(TypedDict, total=False):
    audio_bytes: str
    audio_filename: str
    audio_key: str
    video_bytes: str
    video_filename: str
    video_key: str

class MergeVideoAudioOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

