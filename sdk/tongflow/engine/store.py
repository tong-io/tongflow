"""Asset stores: where a node's binary output lives between/after execution.

- :class:`MemoryStore` (default, ``inline_outputs=True``): outputs stay in
  memory keyed by a ``mem://<id>/<name>`` handle (``mem://<id>`` without a
  filename) — zero files on disk. The runner resolves the handles back to
  ``bytesBase64`` for the caller at the end.
- :class:`DiskStore` (``inline_outputs=False`` / desktop delegation): outputs
  are written to ``out_dir/<id>/<name>`` (``out_dir/<id>.<ext>`` without a
  filename) and the ``file_key`` is a path (relative to ``file_key_base`` when
  set, else absolute), matching the server's ``saveFile`` contract so the
  canvas can read them via ``/api/uploads``.
- :class:`HttpStore` (``asset_endpoint`` option): the embedding host owns
  file storage (e.g. a cloud backend writing to object storage). ``put``
  POSTs raw bytes over loopback HTTP and gets back the host-assigned
  ``file_key``; ``get`` fetches bytes for any ``file_key`` the host knows.
  The engine never sees storage credentials.

``<name>`` is the producer's sanitized ``filename`` (:func:`store_key_name`).
A downstream Asset input derives its ``filename`` from the key's last path
segment, so it receives the producer's own name (``page1-r03-table.png``), not
a random id. The TypeScript engine's stores key the same way.

``get`` returns the bytes for a key the store owns, else ``None`` (so the
filesystem/URL resolver in :mod:`assets` handles plain file_keys / URLs).
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Optional, Protocol


#: Longest :func:`store_key_name` in UTF-8 bytes (under the 255-byte limit).
STORE_KEY_NAME_MAX_BYTES = 120

# Controls, space, path separators, and characters a URL, a query split or a
# Windows file name would trip over.
_UNSAFE_NAME_CHARS = re.compile(r'[\x00-\x20\x7f/\\?#%:*"<>|]')


def _suffix_of(name: str) -> str:
    """``PurePath(name).suffix`` without the dot ("" when there is none)."""
    i = name.rfind(".")
    if i <= 0 or i == len(name) - 1:
        return ""
    return name[i + 1 :]


def _utf8_len(s: str) -> int:
    return len(s.encode("utf-8", "surrogatepass"))


def store_key_name(filename: Optional[str], ext: str) -> Optional[str]:
    """The last key segment that keeps a producer's ``filename``.

    Mirrors ``storeKeyName`` in ``packages/tongflow/src/engine/assets.ts``:
    control characters, spaces, path separators and ``? # % : * " < > |``
    become ``_``; leading and trailing dots are dropped; a name without an
    extension gets ``.<ext>``; the stem is cut to fit
    :data:`STORE_KEY_NAME_MAX_BYTES` (the extension is kept). ``None`` when
    there is no usable name (the store keeps its name-less key form).
    """
    if not filename:
        return None
    name = _UNSAFE_NAME_CHARS.sub("_", filename).lstrip(".").rstrip(".")
    if not name:
        return None
    clean_ext = _UNSAFE_NAME_CHARS.sub("_", ext.lstrip("."))
    suffix = _suffix_of(name)
    if not suffix and clean_ext:
        name = f"{name}.{clean_ext}"
        suffix = clean_ext
    if _utf8_len(name) <= STORE_KEY_NAME_MAX_BYTES:
        return name
    tail = f".{suffix}" if suffix and len(suffix) <= 16 else ""
    budget = STORE_KEY_NAME_MAX_BYTES - _utf8_len(tail)
    stem = ""
    for ch in name[: len(name) - len(tail)]:
        size = _utf8_len(ch)
        if size > budget:
            break
        stem += ch
        budget -= size
    return f"{stem}{tail}"


class AssetStore(Protocol):
    def put(
        self,
        data: bytes,
        *,
        mime: Optional[str] = None,
        filename: Optional[str] = None,
        ext: str = "bin",
    ) -> dict[str, str]: ...

    def get(self, file_key: str) -> Optional[bytes]: ...


class MemoryStore:
    SCHEME = "mem://"

    def __init__(self) -> None:
        self._blobs: dict[str, bytes] = {}

    def put(
        self,
        data: bytes,
        *,
        mime: Optional[str] = None,
        filename: Optional[str] = None,
        ext: str = "bin",
    ) -> dict[str, str]:
        name = store_key_name(filename, ext)
        key = f"{self.SCHEME}{uuid.uuid4().hex}" + (f"/{name}" if name else "")
        self._blobs[key] = data
        out: dict[str, str] = {"file_key": key}
        if mime:
            out["mime"] = mime
        if filename:
            out["filename"] = filename
        return out

    def get(self, file_key: str) -> Optional[bytes]:
        return self._blobs.get(file_key)


class DiskStore:
    def __init__(
        self, out_dir: Path, file_key_base: Optional[Path] = None
    ) -> None:
        self.out_dir = Path(out_dir)
        self.file_key_base = Path(file_key_base) if file_key_base else None

    def _file_key_for(self, path: Path) -> str:
        if self.file_key_base is not None:
            rel = os.path.relpath(path.resolve(), self.file_key_base.resolve())
            return rel.replace(os.sep, "/")
        return str(path.resolve())

    def put(
        self,
        data: bytes,
        *,
        mime: Optional[str] = None,
        filename: Optional[str] = None,
        ext: str = "bin",
    ) -> dict[str, str]:
        ext = ext.lstrip(".") or "bin"
        file_id = uuid.uuid4().hex
        name = store_key_name(filename, ext)
        path = (
            self.out_dir / file_id / name if name else self.out_dir / f"{file_id}.{ext}"
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        out: dict[str, str] = {"file_key": self._file_key_for(path)}
        if mime:
            out["mime"] = mime
        if filename:
            out["filename"] = filename
        return out

    def get(self, file_key: str) -> Optional[bytes]:
        # Disk file_keys are resolved by the filesystem/URL resolver in assets.
        return None


class HttpStore:
    """Host-managed asset store over (loopback) HTTP.

    The host exposes a single endpoint:

    - ``POST <endpoint>?ext=..&mime=..&filename=..`` with raw bytes as the
      body -> ``{"file_key": "..."}``
    - ``GET <endpoint>?file_key=..`` -> raw bytes (404 when unknown)

    Authentication is a Bearer token minted by the host per engine run.
    """

    # Refs the host sink cannot serve; skip the round trip and let the
    # URL/data resolver in assets handle them.
    _SKIP_PREFIXES = ("http://", "https://", "data:", "mem://")

    def __init__(self, endpoint: str, token: Optional[str] = None) -> None:
        self.endpoint = endpoint
        self.token = token

    def _headers(self) -> dict[str, str]:
        # A non-default User-Agent is required: Cloudflare's bot filtering 403s
        # the stock Python-urllib UA, which breaks asset IO from a plugin
        # container talking to the Worker sink.
        headers = {"User-Agent": "tongflow-sdk/1.0"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def put(
        self,
        data: bytes,
        *,
        mime: Optional[str] = None,
        filename: Optional[str] = None,
        ext: str = "bin",
    ) -> dict[str, str]:
        params = {"ext": ext.lstrip(".") or "bin"}
        if mime:
            params["mime"] = mime
        if filename:
            params["filename"] = filename
        req = urllib.request.Request(
            f"{self.endpoint}?{urllib.parse.urlencode(params)}",
            data=bytes(data),
            method="POST",
            headers={
                "Content-Type": "application/octet-stream",
                **self._headers(),
            },
        )
        with urllib.request.urlopen(req) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        file_key = payload.get("file_key")
        if not isinstance(file_key, str) or not file_key:
            raise RuntimeError("asset endpoint returned no file_key")
        out: dict[str, str] = {"file_key": file_key}
        if mime:
            out["mime"] = mime
        if filename:
            out["filename"] = filename
        return out

    def get(self, file_key: str) -> Optional[bytes]:
        if file_key.startswith(self._SKIP_PREFIXES):
            return None
        req = urllib.request.Request(
            f"{self.endpoint}?{urllib.parse.urlencode({'file_key': file_key})}",
            headers=self._headers(),
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise
