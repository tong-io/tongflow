from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class VideoEditInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    video: Asset
    height: int | None = None
    seed: int | None = None
    width: int | None = None

class VideoEditOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

