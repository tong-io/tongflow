from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class VideoImageGenVideoMoveInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset
    video: Asset
    duration: float | None = None
    enhance_prompt: bool | None = None
    seed: float | None = None
    text: str | None = None


class VideoImageGenVideoMoveOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None
