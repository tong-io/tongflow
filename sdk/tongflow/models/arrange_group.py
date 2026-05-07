from __future__ import annotations

from typing import Required, TypedDict

from .asset import Asset, FileRef


class ArrangeGroupInputRootInfosItem(TypedDict, total=False):
    pass

class ArrangeGroupInputRootItemsItem(TypedDict, total=False):
    id: str
    text: str

class ArrangeGroupInput(TypedDict, total=False):
    duplicatable: bool
    fileKeys: list[str]
    groupCount: int
    infos: list["ArrangeGroupInputRootInfosItem"]
    items: list["ArrangeGroupInputRootItemsItem"]
    query: str

class ArrangeGroupOutput(TypedDict, total=False):
    audio_base64: FileRef
    error: str
    groups: list[list[str]]
    image_base64: FileRef
    success: Required[bool]
    text: str
    texts: list[str]
    thinking: str
    video_base64: FileRef

