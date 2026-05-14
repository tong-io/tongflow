from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ImageImageGenVideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    end_image: Asset
    image: Asset
    text: str
    audio: Asset | None = None
    audio_start_time: float | None = None
    duration: float | None = None
    enhance_prompt: bool | None = None
    height: int | None = None
    image2: Asset | None = None
    image_frame_idx: int | None = None
    image_strength: float | None = None
    negative_prompt: str | None = None
    num_inference_steps: int | None = None
    seed: float | None = None
    speech: Asset | None = None
    width: int | None = None

class ImageImageGenVideoOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    video: Asset | None = None

