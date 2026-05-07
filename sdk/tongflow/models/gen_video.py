from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class GenVideoInput(TypedDict, total=False):
    audio_base64: str
    audio_max_duration: float
    audio_start_time: float
    end_image_base64: str
    enhance_prompt: bool
    frame_rate: float
    height: int
    image2_base64: str
    image_base64: str
    image_frame_idx: int
    image_strength: float
    negative_prompt: str
    num_frames: int
    num_inference_steps: int
    seed: float
    speech_base64: str
    text: Required[str]
    texts: list[str]
    width: int

class GenVideoOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

