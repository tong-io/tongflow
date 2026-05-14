from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class VideoUpscaleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video: Asset
    batch_size: int | None = None
    color_correction: str | None = None
    dit_variant: str | None = None
    image: Asset | None = None
    out_fps: float | None = None
    resolution: str | None = None
    seed: int | None = None
    temporal_overlap: int | None = None
    uniform_batch_size: bool | None = None

class VideoUpscaleOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

