from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class CombineTextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    texts: list[str]
    userPrompt: str | None = None

class CombineTextOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    text: str | None = None

