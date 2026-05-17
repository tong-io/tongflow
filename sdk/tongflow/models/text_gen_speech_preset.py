from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class TextGenSpeechPresetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    instruct: str | None = None
    language: str | None = None
    max_new_tokens: int | None = None
    speaker: str | None = None

class TextGenSpeechPresetOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None

