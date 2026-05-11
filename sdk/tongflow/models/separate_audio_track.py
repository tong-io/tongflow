from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class SeparateAudioTrackInput(TypedDict, total=False):
    audio: Required[Asset]

class SeparateAudioTrackOutput(TypedDict, total=False):
    error: str
    file_key: AudioRef
    success: Required[bool]

