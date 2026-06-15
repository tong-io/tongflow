from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class SplitVideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video: Asset
    threshold: float | None = None

class SplitVideoOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video_parts: list[Asset] | None = None

