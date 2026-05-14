from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class LinkInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str

class LinkOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    audio: Asset | None = None
    error: str | None = None
    extractedTexts: list[str] | None = None
    image: Asset | None = None
    mainText: str | None = None
    thinking: str | None = None
    video: Asset | None = None

