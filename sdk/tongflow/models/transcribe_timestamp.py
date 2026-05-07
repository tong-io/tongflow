from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class TranscribeTimestampOutputRootTimeStampsItem(TypedDict, total=False):
    end_time: Required[float]
    start_time: Required[float]
    text: Required[str]

class TranscribeTimestampInput(TypedDict, total=False):
    audio: Required[Asset]
    context: str
    language: str
    max_new_tokens: float

class TranscribeTimestampOutput(TypedDict, total=False):
    error: str
    file_key: str
    language: str
    result: str
    success: Required[bool]
    text: str
    time_stamps: list["TranscribeTimestampOutputRootTimeStampsItem"]

