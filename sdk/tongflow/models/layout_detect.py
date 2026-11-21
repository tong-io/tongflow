from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class LayoutDetectInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset

class LayoutDetectOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    layout: str | None = None
    regions: list[Asset] | None = None

