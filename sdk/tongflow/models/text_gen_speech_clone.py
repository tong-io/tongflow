from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class TextGenSpeechCloneInput(TypedDict, total=False):
    audio_base64: str
    language: str
    max_new_tokens: int
    ref_audio_base64: Required[str]
    ref_text: str
    text: Required[str]
    x_vector_only: bool

class TextGenSpeechCloneOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

