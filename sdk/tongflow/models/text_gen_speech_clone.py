from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class TextGenSpeechCloneInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ref_audio: Asset
    text: str
    language: str | None = None
    max_new_tokens: int | None = None
    ref_text: str | None = None
    x_vector_only: bool | None = None

class TextGenSpeechCloneOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None

