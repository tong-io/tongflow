from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageGenInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    height: int | None = None
    seed: int | None = None
    text: str | None = None
    width: int | None = None

class ImageGenOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    image: Asset | None = None

