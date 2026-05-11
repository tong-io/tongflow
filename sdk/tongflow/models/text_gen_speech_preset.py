from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class TextGenSpeechPresetInput(TypedDict, total=False):
    instruct: str
    language: str
    max_new_tokens: int
    text: Required[str]

class TextGenSpeechPresetOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

