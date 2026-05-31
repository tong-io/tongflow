from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class AudioVideoLipSyncInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset
    video: Asset
    seed: float | None = None
    text: str | None = None

class AudioVideoLipSyncOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

