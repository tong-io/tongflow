from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class DiarizeSpeakersInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset

class DiarizeSpeakersOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    segments: str | None = None

