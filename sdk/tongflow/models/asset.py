from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class Asset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bytesBase64: str
    filename: str | None = None
    mime: str | None = None


class FileRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_key: str
    mime: str | None = None
    filename: str | None = None


class ImageRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_key: str
    mime: str | None = None
    filename: str | None = None


class VideoRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_key: str
    mime: str | None = None
    filename: str | None = None


class AudioRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_key: str
    mime: str | None = None
    filename: str | None = None


class ModelRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_key: str
    mime: str | None = None
    filename: str | None = None
