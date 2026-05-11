from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class SeparateSpeakerInput(TypedDict, total=False):
    audio: Required[Asset]

class SeparateSpeakerOutput(TypedDict, total=False):
    error: str
    outputKeys: list[AudioRef]
    success: Required[bool]

