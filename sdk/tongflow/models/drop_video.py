from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class DropVideoOutputRootClipsItem(TypedDict, total=False):
    fileKey: Required[str]
    keep: Required[bool]

class DropVideoInput(TypedDict, total=False):
    fileKeys: list[str]
    query: str

class DropVideoOutput(TypedDict, total=False):
    audio_base64: FileRef
    clips: list["DropVideoOutputRootClipsItem"]
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

