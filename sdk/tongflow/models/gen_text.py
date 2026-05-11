from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class GenTextInput(TypedDict, total=False):
    nodeSlot: str
    pluginId: str
    text: Required[str]
    userPrompt: str

class GenTextOutput(TypedDict, total=False):
    error: str
    result: str
    success: Required[bool]
    text: str

