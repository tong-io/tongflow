from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class SplitTextInput(TypedDict, total=False):
    nodeSlot: str
    pluginId: str
    text: Required[str]
    userPrompt: str

class SplitTextOutput(TypedDict, total=False):
    error: str
    result: str
    success: Required[bool]
    text: str

