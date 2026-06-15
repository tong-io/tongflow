from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class TextAudioGenSpeechInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset
    text: str
    emotion: str | None = None
    style: str | None = None

class TextAudioGenSpeechOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None

