from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class TranscribeInput(TypedDict, total=False):
    audio: Required[Asset]
    context: str
    language: str
    max_new_tokens: float

class TranscribeOutput(TypedDict, total=False):
    error: str
    file_key: str
    language: str
    result: str
    success: Required[bool]
    text: str

