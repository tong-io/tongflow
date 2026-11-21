from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class AudioTagInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset

class AudioTagOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    tags: str | None = None

