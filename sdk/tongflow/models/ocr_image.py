from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class OcrImageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset

class OcrImageOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    text: str | None = None

