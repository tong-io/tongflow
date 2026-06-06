from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class MergeVideoAudioInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset
    video: Asset

class MergeVideoAudioOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

