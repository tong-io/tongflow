from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class SpeechVideoGenVideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    video: Asset
    enhance_prompt: bool | None = None
    reference_strength: float | None = None
    seed: float | None = None

class SpeechVideoGenVideoOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

