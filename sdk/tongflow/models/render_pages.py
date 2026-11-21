from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class RenderPagesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document: Asset

class RenderPagesOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    pages: list[Asset] | None = None

