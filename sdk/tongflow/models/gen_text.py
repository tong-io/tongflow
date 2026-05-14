from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class GenTextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    userPrompt: str | None = None

class GenTextOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    text: str | None = None

