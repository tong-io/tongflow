from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageGenTextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    enable_thinking: bool | None = None
    image: Asset | None = None
    max_new_tokens: int | None = None
    system: str | None = None
    temperature: float | None = None
    top_k: int | None = None
    top_p: float | None = None

class ImageGenTextOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    text: str | None = None

