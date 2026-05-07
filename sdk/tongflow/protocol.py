from __future__ import annotations

import base64
from typing import Any, Protocol, TypedDict, runtime_checkable

from typing_extensions import NotRequired


class Asset(TypedDict):
    """Wire-format binary payload (matches Openflow ABI ``Asset``)."""

    bytesBase64: str
    mime: NotRequired[str]
    filename: NotRequired[str]


class FileRef(TypedDict):
    """Persisted file handle (matches Openflow ABI ``FileRef`` after runner persist)."""

    file_key: str
    mime: NotRequired[str]
    filename: NotRequired[str]


def prompt_media_to_bytes(val: object) -> bytes:
    """Decode Modal/Openflow prompt fields: ABI ``Asset`` dict or base64 ``str`` / ``bytes``."""

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
    out: Asset = {
        "bytesBase64": base64.b64encode(data).decode("ascii"),
        "mime": mime,
    }
    if filename is not None:
        out["filename"] = filename
    return out


class HandlerResult(TypedDict, total=False):
    success: bool
    text: str
    error: str
    language: str
    time_stamps: list[dict[str, Any]]

class TaskPayload(TypedDict, total=False):
    """Openflow task object passed to plugin methods (minimal typed shape)."""

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
