from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class SeparateVideoAudioInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video: Asset

class SeparateVideoAudioOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None
    video: Asset | None = None

