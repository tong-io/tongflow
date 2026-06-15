from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class SeparateSpeakerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset

class SeparateSpeakerOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    outputKeys: list[Asset] | None = None

