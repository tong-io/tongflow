from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class GenMusicInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bpm: float | None = None
    duration: float | None = None
    keyscale: str | None = None
    language: str | None = None
    lyrics: str | None = None
    seed: int | None = None
    songTitle: str | None = None
    tags: str | None = None
    text: str | None = None

class GenMusicOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None

