from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class AudioImageGenVideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset
    image: Asset
    height: int | None = None
    text: str | None = None
    width: int | None = None

class AudioImageGenVideoOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

