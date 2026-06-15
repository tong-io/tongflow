from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class SeparateAudioTrackInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset

class SeparateAudioTrackOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    file_key: Asset | None = None

