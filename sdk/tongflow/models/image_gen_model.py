from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageGenModelInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset
    height: int | None = None
    seed: int | None = None
    text: str | None = None
    width: int | None = None

class ImageGenModelOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    model: Asset | None = None

