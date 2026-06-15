"""Asset materialization for the standalone engine.

Two schema-driven passes that mirror the server:

- :func:`materialize_asset_inputs` — translate ``prepare-asset-input.server.ts``:
  walk a slot's input schema for ``$ref: Asset`` (single + array) and turn any
  ``file_key`` / ``data:`` URL / http(s) URL / ``mem://`` handle into
  ``{bytesBase64, mime?, filename?}``.
- :func:`convert_asset_outputs_to_file_refs` — translate
  ``convert-output-fileref.ts``: walk a slot's output schema for
  ``$ref: FileRef`` (single + array) and hand any ``bytesBase64`` the plugin
  returned to the :class:`~tongflow.engine.store.AssetStore`, replacing it with
  ``{file_key, mime?, filename?}``. The store decides memory vs disk.
"""

from __future__ import annotations

import base64
import urllib.request
from pathlib import Path
from typing import Any, Optional, Sequence

from .abi_schema import (
    AbiSchema,
    array_items_are_asset,
    array_items_are_file_ref,
    schema_is_asset,
    schema_is_file_ref,
)
from .store import AssetStore

_MIME_BY_EXT = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
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

# Reverse map for choosing an output file extension from a mime (first match).
_EXT_BY_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
    "application/octet-stream": "bin",
}

_UPLOAD_URL_PREFIX = "/api/uploads/"


def _mime_from_ext(name: str) -> Optional[str]:
    ext = Path(name).suffix.lstrip(".").lower()
    return _MIME_BY_EXT.get(ext)


def _ext_from_mime(mime: str) -> Optional[str]:
    return _EXT_BY_MIME.get(mime.split(";")[0].strip().lower())


def _ext_from_filename(name: str) -> Optional[str]:
    ext = Path(name).suffix.lstrip(".")
    return ext.lower() or None


def _is_already_asset(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("bytesBase64"), str)
        and len(value["bytesBase64"]) > 0
    )


def _strip_data_url(s: str) -> Optional[dict[str, Any]]:
    t = s.strip()
    if not t.startswith("data:") or "," not in t:
        return None
    head = t[5 : t.index(",")]
    rest = t[t.index(",") + 1 :]
    mime = head.split(";")[0].strip() or None
    out: dict[str, Any] = {"bytesBase64": rest}
    if mime:
        out["mime"] = mime
    return out


def _read_reference_bytes(
    ref: str, search_dirs: Sequence[Path], store: AssetStore
) -> bytes:
    # Store-owned handle (e.g. mem://) first.
    blob = store.get(ref)
    if blob is not None:
        return blob
    if ref.startswith("http://") or ref.startswith("https://"):
        with urllib.request.urlopen(ref) as resp:  # noqa: S310 - http(s) only
            return resp.read()
    key = ref
    if key.startswith(_UPLOAD_URL_PREFIX):
        key = key[len(_UPLOAD_URL_PREFIX) :]
    p = Path(key)
    if p.is_absolute() and p.is_file():
        return p.read_bytes()
    for d in search_dirs:
        cand = d / key
        if cand.is_file():
            return cand.read_bytes()
    if p.is_file():
        return p.read_bytes()
    raise FileNotFoundError(
        f"Could not resolve asset reference '{ref}' "
        f"(searched: {', '.join(str(d) for d in search_dirs)})"
    )


def _resolve_single_asset(
    value: Any, field_name: str, search_dirs: Sequence[Path], store: AssetStore
) -> Any:
    if value is None:
        return value
    if _is_already_asset(value):
        return value
    if not isinstance(value, str):
        return value

    data_asset = _strip_data_url(value)
    if data_asset is not None:
        return data_asset

    data = _read_reference_bytes(value, search_dirs, store)
    filename = Path(value.split("?")[0]).name
    out: dict[str, Any] = {
        "bytesBase64": base64.b64encode(data).decode("ascii"),
        "filename": filename,
    }
    mime = _mime_from_ext(filename)
    if mime:
        out["mime"] = mime
    return out


def materialize_asset_inputs(
    slot: str,
    inputs_obj: dict[str, Any],
    abi: AbiSchema,
    search_dirs: Sequence[Path],
    store: AssetStore,
) -> dict[str, Any]:
    schema = abi.inputs(slot)
    props = schema.get("properties")
    if not isinstance(props, dict):
        return dict(inputs_obj)

    out = dict(inputs_obj)
    for key, sub in props.items():
        if key not in out:
            continue
        if schema_is_asset(sub):
            out[key] = _resolve_single_asset(out[key], key, search_dirs, store)
        elif array_items_are_asset(sub):
            arr = out[key]
            if isinstance(arr, list):
                out[key] = [
                    _resolve_single_asset(item, f"{key}[{i}]", search_dirs, store)
                    for i, item in enumerate(arr)
                ]
    return out


def _normalize_file_ref(value: Any, store: AssetStore) -> Any:
    if value is None:
        return value
    if not isinstance(value, dict):
        return value

    file_key = value.get("file_key")
    if isinstance(file_key, str) and file_key.strip():
        result: dict[str, Any] = {"file_key": file_key.strip()}
        if isinstance(value.get("mime"), str):
            result["mime"] = value["mime"]
        if isinstance(value.get("filename"), str):
            result["filename"] = value["filename"]
        return result

    b64 = value.get("bytesBase64")
    if isinstance(b64, str) and b64:
        buf = base64.b64decode(b64)
        if len(buf) == 0:
            raise ValueError(
                "Plugin returned empty binary payload for a FileRef field "
                "(decoded length 0)"
            )
        mime_val = value.get("mime")
        mime = mime_val if isinstance(mime_val, str) else None
        filename = (
            value["filename"] if isinstance(value.get("filename"), str) else None
        )
        ext = (
            _ext_from_mime(mime or "")
            or (_ext_from_filename(filename) if filename else None)
            or "bin"
        )
        return store.put(buf, mime=mime, filename=filename, ext=ext)

    return value


def convert_asset_outputs_to_file_refs(
    slot: str,
    raw: Any,
    abi: AbiSchema,
    store: AssetStore,
) -> Any:
    if not isinstance(raw, dict):
        return raw
    out = dict(raw)
    if out.get("success") is False:
        return out

    schema = abi.outputs(slot)
    props = schema.get("properties")
    if not isinstance(props, dict):
        return out

    for key, sub in props.items():
        if key not in out:
            continue
        if schema_is_file_ref(sub):
            out[key] = _normalize_file_ref(out[key], store)
        elif array_items_are_file_ref(sub) and isinstance(out[key], list):
            out[key] = [_normalize_file_ref(item, store) for item in out[key]]
    return out
