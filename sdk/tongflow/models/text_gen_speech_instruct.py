from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class TextGenSpeechInstructInput(TypedDict, total=False):
    instruct: str
    language: str
    max_new_tokens: int
    speaker: str
    text: Required[str]

class TextGenSpeechInstructOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

