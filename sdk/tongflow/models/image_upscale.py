from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageUpscaleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset
    resolution: str | None = None
    seed: int | None = None

class ImageUpscaleOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    image: Asset | None = None

