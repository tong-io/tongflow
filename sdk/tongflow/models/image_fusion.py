from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageFusionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    height: int | None = None
    images: list[Asset] | None = None
    seed: int | None = None
    width: int | None = None

class ImageFusionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    image: Asset | None = None

