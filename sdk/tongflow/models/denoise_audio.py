from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class DenoiseAudioInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fileKey: Asset

class DenoiseAudioOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None

