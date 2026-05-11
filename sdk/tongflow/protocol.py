from __future__ import annotations

import base64
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Protocol, TypedDict, Union, runtime_checkable

from typing_extensions import NotRequired


class Asset(TypedDict):
    """Wire-format binary payload (matches Tongflow ABI ``Asset``)."""

    bytesBase64: str
    mime: NotRequired[str]
    filename: NotRequired[str]


_EXT_TO_MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "mov": "video/quicktime",
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "m4a": "audio/mp4",
    "ogg": "audio/ogg",
    "opus": "audio/opus",
    "flac": "audio/flac",
    "pdf": "application/pdf",
    "txt": "text/plain",
}


def _mime_from_ext(p: Path) -> str:
    ext = p.suffix.lstrip(".").lower()
    return _EXT_TO_MIME.get(ext, "application/octet-stream")


class FileRef(TypedDict):
    """Persisted file handle (matches Tongflow ABI ``FileRef`` after runner persist)."""

    file_key: str
    mime: NotRequired[str]
    filename: NotRequired[str]


class ImageRef(TypedDict):
    """Persisted image handle (matches Tongflow ABI ``ImageRef``)."""

    file_key: str
    mime: NotRequired[str]
    filename: NotRequired[str]


class VideoRef(TypedDict):
    """Persisted video handle (matches Tongflow ABI ``VideoRef``)."""

    file_key: str
    mime: NotRequired[str]
    filename: NotRequired[str]


class AudioRef(TypedDict):
    """Persisted audio handle (matches Tongflow ABI ``AudioRef``)."""

    file_key: str
    mime: NotRequired[str]
    filename: NotRequired[str]


def prompt_media_to_bytes(val: object) -> bytes:
    """Decode Modal/Tongflow prompt fields: ABI ``Asset`` dict or base64 ``str`` / ``bytes``."""

    if isinstance(val, (bytes, bytearray)):
        return bytes(val)
    if isinstance(val, dict):
        b64 = val.get("bytesBase64")
        if isinstance(b64, str):
            return base64.b64decode(b64)
    if isinstance(val, str):
        return base64.b64decode(val)
    raise TypeError(f"unsupported media payload: {type(val).__name__}")


def asset(data: bytes, *, mime: str, filename: str | None = None) -> Asset:
    """Build an ABI ``Asset`` from raw bytes."""
    out: Asset = {
        "bytesBase64": base64.b64encode(data).decode("ascii"),
        "mime": mime,
    }
    if filename is not None:
        out["filename"] = filename
    return out


def asset_from_path(p: Union[str, Path], *, mime: str | None = None) -> Asset:
    """Read a file and wrap it as an ABI ``Asset``. ``mime`` auto-detected from extension."""
    path = Path(p)
    return asset(
        path.read_bytes(),
        mime=mime or _mime_from_ext(path),
        filename=path.name,
    )


def asset_to_tempfile(val: object, *, suffix: str = "") -> Path:
    """Decode an Asset / base64 / bytes into a NamedTemporaryFile and return the path.

    Caller is responsible for cleanup. Prefer :func:`asset_as_path` (context manager).
    """
    data = prompt_media_to_bytes(val)
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
    except Exception:
        try:
            os.unlink(path)
        finally:
            raise
    return Path(path)


@contextmanager
def asset_as_path(val: object, *, suffix: str = "") -> Iterator[Path]:
    """Context manager: write an Asset to a temp file; auto-cleanup on exit."""
    p = asset_to_tempfile(val, suffix=suffix)
    try:
        yield p
    finally:
        try:
            p.unlink()
        except FileNotFoundError:
            pass


class HandlerResult(TypedDict, total=False):
    success: bool
    text: str
    error: str
    language: str
    time_stamps: list[dict[str, Any]]

class TaskPayload(TypedDict, total=False):
    """Tongflow task object passed to plugin methods (minimal typed shape)."""

    taskId: str
    userId: str
    feature: str
    type: str
    function: str
    prompt: dict[str, Any]
    nodeId: str


@runtime_checkable
class InferenceProtocol(Protocol):
    """Modal @app.cls — implement `inference` or one method per `nodeSlot`."""

    def inference(self, task: TaskPayload) -> HandlerResult: ...
