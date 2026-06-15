from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class TextGenSpeechInstructInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    instruct: str | None = None
    language: str | None = None
    max_new_tokens: int | None = None

class TextGenSpeechInstructOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None

