from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class EmbedImageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset

class EmbedImageOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    vectors: Asset | None = None

