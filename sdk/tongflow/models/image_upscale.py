from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageUpscaleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset
    batch_size: int | None = None
    color_correction: str | None = None
    dit_variant: str | None = None
    out_fps: float | None = None
    resolution: str | None = None
    seed: int | None = None
    temporal_overlap: int | None = None
    uniform_batch_size: bool | None = None
    video: Asset | None = None

class ImageUpscaleOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    image: Asset | None = None

