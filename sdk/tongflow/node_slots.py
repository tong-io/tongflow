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
    GEN_VIDEO: Final[str] = 'gen-video'
    IMAGE_GEN: Final[str] = 'image-gen'
    GEN_MUSIC: Final[str] = 'gen-music'
    TEXT_GEN_SPEECH_PRESET: Final[str] = 'text-gen-speech-preset'
    IMAGE_GEN_VIDEO: Final[str] = 'image-gen-video'
    IMAGE_EDIT: Final[str] = 'image-edit'
    IMAGE_UPSCALE: Final[str] = 'image-upscale'
    VIDEO_UPSCALE: Final[str] = 'video-upscale'
    IMAGE_DESCRIBE: Final[str] = 'image-describe'
    VIDEO_DESCRIBE: Final[str] = 'video-describe'
    AUDIO_IMAGE_GEN_VIDEO: Final[str] = 'audio-image-gen-video'
    SPEECH_TEXT_GEN_VIDEO: Final[str] = 'speech-text-gen-video'
    SPEECH_IMAGE_VIDEO_GEN_VIDEO: Final[str] = 'speech-image-video-gen-video'
    VIDEO_IMAGE_GEN_VIDEO_MIX: Final[str] = 'video-image-gen-video-mix'
    VIDEO_IMAGE_GEN_VIDEO_MOVE: Final[str] = 'video-image-gen-video-move'
    IMAGE_IMAGE_GEN_VIDEO: Final[str] = 'image-image-gen-video'
    TEXT_GEN_VIDEO: Final[str] = 'text-gen-video'
    IMAGE_GEN_MODEL: Final[str] = 'image-gen-model'
    SPEECH_VIDEO_GEN_VIDEO: Final[str] = 'speech-video-gen-video'
    TEXT_GEN_SPEECH_CLONE: Final[str] = 'text-gen-speech-clone'
    TRANSCRIBE_TIMESTAMP: Final[str] = 'transcribe-timestamp'
    TEXT_GEN_SPEECH_INSTRUCT: Final[str] = 'text-gen-speech-instruct'
    VIDEO_IMAGE_MOVE_ANIMAL: Final[str] = 'video-image-move-animal'
    WAN_ANIMATE_MIX: Final[str] = 'wan-animate-mix'
    DROP_VIDEO: Final[str] = 'drop-video'
    ARRANGE_GROUP: Final[str] = 'arrange-group'


ALL_NODE_SLOTS: Final[tuple[str, ...]] = (
    'gen-text',
    'split-text',
    'combine-text',
    'image-fusion',
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
    'gen-video',
    'image-gen',
    'gen-music',
    'text-gen-speech-preset',
    'image-gen-video',
    'image-edit',
    'image-upscale',
    'video-upscale',
    'image-describe',
    'video-describe',
    'audio-image-gen-video',
    'speech-text-gen-video',
    'speech-image-video-gen-video',
    'video-image-gen-video-mix',
    'video-image-gen-video-move',
    'image-image-gen-video',
    'text-gen-video',
    'image-gen-model',
    'speech-video-gen-video',
    'text-gen-speech-clone',
    'transcribe-timestamp',
    'text-gen-speech-instruct',
    'video-image-move-animal',
    'wan-animate-mix',
    'drop-video',
    'arrange-group',
)

