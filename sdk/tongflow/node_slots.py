"""Generated from config/tongflow.abi.json. DO NOT EDIT."""

from __future__ import annotations

import re
from typing import Final


def _slot_to_ident(slot: str) -> str:
    s = slot.upper()
    s = re.sub(r"[^A-Z0-9]+", "_", s).strip("_")
    if not s:
        return "UNKNOWN"
    if s[0].isdigit():
        s = f"S_{s}"
    return s


class NodeSlots:
    """ABI nodeSlot constants. Use these in @node_slot(...)"""
    GEN_TEXT: Final[str] = 'gen-text'
    SPLIT_TEXT: Final[str] = 'split-text'
    COMBINE_TEXT: Final[str] = 'combine-text'
    IMAGE_FUSION: Final[str] = 'image-fusion'
    IMAGES_GEN_VIDEO: Final[str] = 'images-gen-video'
    IMAGE_GEN_TEXT: Final[str] = 'image-gen-text'
    VIDEO_GEN_TEXT: Final[str] = 'video-gen-text'
    TRANSCRIBE: Final[str] = 'transcribe'
    CONCAT_VIDEOS: Final[str] = 'concat-videos'
    EXTRACT_AUDIO: Final[str] = 'extract-audio'
    REMOVE_VIDEO_AUDIO: Final[str] = 'remove-video-audio'
    MERGE_VIDEO_AUDIO: Final[str] = 'merge-video-audio'
    AUDIO_VIDEO_LIP_SYNC: Final[str] = 'audio-video-lip-sync'
    GET_FIRST_FRAME: Final[str] = 'get-first-frame'
    GET_LAST_FRAME: Final[str] = 'get-last-frame'
    PARSE_DOCUMENT: Final[str] = 'parse-document'
    SPLIT_VIDEO: Final[str] = 'split-video'
    LINK: Final[str] = 'link'
    IMAGE_GEN: Final[str] = 'image-gen'
    GEN_MUSIC: Final[str] = 'gen-music'
    TEXT_GEN_SPEECH_PRESET: Final[str] = 'text-gen-speech-preset'
    IMAGE_GEN_VIDEO: Final[str] = 'image-gen-video'
    IMAGE_EDIT: Final[str] = 'image-edit'
    IMAGE_UPSCALE: Final[str] = 'image-upscale'
    VIDEO_UPSCALE: Final[str] = 'video-upscale'
    VIDEO_EDIT: Final[str] = 'video-edit'
    IMAGE_DESCRIBE: Final[str] = 'image-describe'
    VIDEO_DESCRIBE: Final[str] = 'video-describe'
    AUDIO_IMAGE_GEN_VIDEO: Final[str] = 'audio-image-gen-video'
    SPEECH_TEXT_GEN_VIDEO: Final[str] = 'speech-text-gen-video'
    VIDEO_IMAGE_GEN_VIDEO_MIX: Final[str] = 'video-image-gen-video-mix'
    VIDEO_IMAGE_GEN_VIDEO_MOVE: Final[str] = 'video-image-gen-video-move'
    IMAGE_IMAGE_GEN_VIDEO: Final[str] = 'image-image-gen-video'
    TEXT_GEN_VIDEO: Final[str] = 'text-gen-video'
    IMAGE_GEN_MODEL: Final[str] = 'image-gen-model'
    SPEECH_VIDEO_GEN_VIDEO: Final[str] = 'speech-video-gen-video'
    TEXT_GEN_SPEECH_CLONE: Final[str] = 'text-gen-speech-clone'
    TRANSCRIBE_TIMESTAMP: Final[str] = 'transcribe-timestamp'
    TEXT_GEN_SPEECH_INSTRUCT: Final[str] = 'text-gen-speech-instruct'
    DROP_VIDEO: Final[str] = 'drop-video'
    ARRANGE_GROUP: Final[str] = 'arrange-group'
    SEPARATE_SPEAKER: Final[str] = 'separate_speaker'
    SEPARATE_AUDIO_TRACK: Final[str] = 'separate_audio_track'
    DENOISE_AUDIO: Final[str] = 'denoise_audio'
    CONVERT_VOICE: Final[str] = 'convert_voice'
    REMOVE_WATERMARK: Final[str] = 'remove_watermark'
    SUBTITLE_REMOVE: Final[str] = 'subtitle_remove'
    TEXT_AUDIO_GEN_SPEECH: Final[str] = 'text-audio-gen-speech'


ALL_NODE_SLOTS: Final[tuple[str, ...]] = (
    'gen-text',
    'split-text',
    'combine-text',
    'image-fusion',
    'images-gen-video',
    'image-gen-text',
    'video-gen-text',
    'transcribe',
    'concat-videos',
    'extract-audio',
    'remove-video-audio',
    'merge-video-audio',
    'audio-video-lip-sync',
    'get-first-frame',
    'get-last-frame',
    'parse-document',
    'split-video',
    'link',
    'image-gen',
    'gen-music',
    'text-gen-speech-preset',
    'image-gen-video',
    'image-edit',
    'image-upscale',
    'video-upscale',
    'video-edit',
    'image-describe',
    'video-describe',
    'audio-image-gen-video',
    'speech-text-gen-video',
    'video-image-gen-video-mix',
    'video-image-gen-video-move',
    'image-image-gen-video',
    'text-gen-video',
    'image-gen-model',
    'speech-video-gen-video',
    'text-gen-speech-clone',
    'transcribe-timestamp',
    'text-gen-speech-instruct',
    'drop-video',
    'arrange-group',
    'separate_speaker',
    'separate_audio_track',
    'denoise_audio',
    'convert_voice',
    'remove_watermark',
    'subtitle_remove',
    'text-audio-gen-speech',
)

