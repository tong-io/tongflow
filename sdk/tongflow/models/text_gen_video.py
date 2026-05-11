from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class TextGenVideoInput(TypedDict, total=False):
    audio: Asset
    audio_max_duration: float
    audio_start_time: float
    end_image: Asset
    enhance_prompt: bool
    frame_rate: float
    height: int
    image: Asset
    image2: Asset
    image_frame_idx: int
    image_strength: float
    negative_prompt: str
    num_frames: int
    num_inference_steps: int
    seed: float
    speech: Asset
    text: Required[str]
    texts: list[str]
    width: int

class TextGenVideoOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

