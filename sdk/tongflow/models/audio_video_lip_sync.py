from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class AudioVideoLipSyncInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: Asset
    video: Asset
    seed: Optional[float] = None
    text: Optional[str] = None


class AudioVideoLipSyncOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: Optional[str] = None
    video: Optional[Asset] = None
