from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class TableRecognizeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset

class TableRecognizeOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    html: str | None = None

