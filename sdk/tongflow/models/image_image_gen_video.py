from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageImageGenVideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    end_image: Asset
    image: Asset
    text: str
    duration: float | None = None
    enhance_prompt: bool | None = None
    height: int | None = None
    image_strength: float | None = None
    seed: float | None = None
    width: int | None = None

class ImageImageGenVideoOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

