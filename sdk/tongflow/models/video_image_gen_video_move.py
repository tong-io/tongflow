from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class VideoImageGenVideoMoveInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset
    video: Asset
    attention_strength: float | None = None
    duration: float | None = None
    enhance_prompt: bool | None = None
    height: int | None = None
    seed: float | None = None
    text: str | None = None
    width: int | None = None

class VideoImageGenVideoMoveOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

