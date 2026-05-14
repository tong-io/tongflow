from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class SubtitleRemoveInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fileKey: Asset

class SubtitleRemoveOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

