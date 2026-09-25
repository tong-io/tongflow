from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ConvertVoiceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset
    ref_audio: Asset

class ConvertVoiceOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None

