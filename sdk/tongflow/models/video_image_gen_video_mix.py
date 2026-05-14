from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class VideoImageGenVideoMixInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset
    video: Asset
    text: str | None = None

class VideoImageGenVideoMixOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

