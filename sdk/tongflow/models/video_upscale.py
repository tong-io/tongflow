from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class VideoUpscaleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video: Asset
    resolution: str | None = None
    seed: int | None = None

class VideoUpscaleOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

