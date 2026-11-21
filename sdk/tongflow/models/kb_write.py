from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class KbWriteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chunks: list[str]
    source: str
    vectors: Asset

class KbWriteOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    text: str | None = None

