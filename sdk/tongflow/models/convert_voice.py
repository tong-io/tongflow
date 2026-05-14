from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ConvertVoiceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceKey: Asset
    targetKey: str

class ConvertVoiceOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None

