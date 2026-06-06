from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class TextGenVideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duration: float
    text: str
    enhance_prompt: bool | None = None
    height: int | None = None
    seed: float | None = None
    width: int | None = None

class TextGenVideoOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

