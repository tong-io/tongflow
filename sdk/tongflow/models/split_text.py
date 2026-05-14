from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class SplitTextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    nodeSlot: str | None = None
    pluginId: str | None = None
    userPrompt: str | None = None

class SplitTextOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    texts: list[str] | None = None

