from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class DropVideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    videos: list[Asset]
    query: str | None = None

class DropVideoOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    clips: list[Asset] | None = None
    error: str | None = None

