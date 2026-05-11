from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class CombineTextInput(TypedDict, total=False):
    nodeSlot: str
    pluginId: str
    texts: Required[list[str]]
    userPrompt: str

class CombineTextOutput(TypedDict, total=False):
    error: str
    result: str
    success: Required[bool]
    text: str

