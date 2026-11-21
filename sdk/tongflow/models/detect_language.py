from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class DetectLanguageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str

class DetectLanguageOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    language: str | None = None

