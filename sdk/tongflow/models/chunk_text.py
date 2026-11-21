from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ChunkTextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    texts: list[str]
    max_chars: int | None = None

class ChunkTextOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    chunks: list[str] | None = None
    error: str | None = None

