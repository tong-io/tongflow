from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef


class ArrangeGroupInputRootInfosItem(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ArrangeGroupInputRootItemsItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = None
    text: str | None = None

class ArrangeGroupInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duplicatable: bool | None = None
    fileKeys: list[Asset] | None = None
    groupCount: int | None = None
    images: list[Asset] | None = None
    infos: list["ArrangeGroupInputRootInfosItem"] | None = None
    items: list["ArrangeGroupInputRootItemsItem"] | None = None
    query: str | None = None

class ArrangeGroupOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    error: str | None = None
    groups: list[list[Asset]] | None = None

