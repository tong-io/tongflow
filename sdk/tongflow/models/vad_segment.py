from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class VadSegmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset

class VadSegmentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    segments: list[Asset] | None = None

