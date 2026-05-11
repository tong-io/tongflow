from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, AudioRef, FileRef, ImageRef, VideoRef


class ArrangeGroupInputRootInfosItem(TypedDict, total=False):
    pass

class ArrangeGroupInputRootItemsItem(TypedDict, total=False):
    id: str
    text: str

class ArrangeGroupInput(TypedDict, total=False):
    duplicatable: bool
    groupCount: int
    images: list[Asset]
    infos: list["ArrangeGroupInputRootInfosItem"]
    items: list["ArrangeGroupInputRootItemsItem"]
    query: str

class ArrangeGroupOutput(TypedDict, total=False):
    audio: AudioRef
    error: str
    groups: list[list[VideoRef]]
    image: ImageRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video: VideoRef

