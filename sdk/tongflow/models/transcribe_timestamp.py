from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class TranscribeTimestampOutputRootTimeStampsItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    end: float
    start: float
    text: str

class TranscribeTimestampInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset
    context: str | None = None
    language: str | None = None
    max_new_tokens: float | None = None

class TranscribeTimestampOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    text: str | None = None
    time_stamps: list["TranscribeTimestampOutputRootTimeStampsItem"] | None = None

