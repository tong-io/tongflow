from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageEditInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Asset
    text: str
    height: int | None = None
    match_input_size: bool | None = None
    seed: int | None = None
    width: int | None = None

class ImageEditOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    image: Asset | None = None

