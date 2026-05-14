from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class VideoDescribeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video: Asset
    text: str | None = None
    userPrompt: str | None = None

class VideoDescribeOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    text: str | None = None

