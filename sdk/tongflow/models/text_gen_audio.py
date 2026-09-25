from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class TextGenAudioInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    ref_audios: list[Asset] | None = None
    seed: int | None = None

class TextGenAudioOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None

