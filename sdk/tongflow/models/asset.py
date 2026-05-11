from __future__ import annotations

from typing import Required, TypedDict


class Asset(TypedDict, total=False):
    bytesBase64: str
    filename: str
    mime: str


class FileRef(TypedDict, total=False):
    file_key: Required[str]
    mime: str
    filename: str


class ImageRef(TypedDict, total=False):
    file_key: Required[str]
    mime: str
    filename: str


class VideoRef(TypedDict, total=False):
    file_key: Required[str]
    mime: str
    filename: str


class AudioRef(TypedDict, total=False):
    file_key: Required[str]
    mime: str
    filename: str
