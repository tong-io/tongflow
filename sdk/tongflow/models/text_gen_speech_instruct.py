from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class TextGenSpeechInstructInput(TypedDict, total=False):
    instruct: str
    language: str
    max_new_tokens: int
    speaker: str
    text: Required[str]

class TextGenSpeechInstructOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

