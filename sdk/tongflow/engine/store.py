"""Asset stores: where a node's binary output lives between/after execution.

- :class:`MemoryStore` (default, ``inline_outputs=True``): outputs stay in
  memory keyed by a ``mem://<id>`` handle — zero files on disk. The runner
  resolves the handles back to ``bytesBase64`` for the caller at the end.
- :class:`DiskStore` (``inline_outputs=False`` / desktop delegation): outputs
  are written to ``out_dir`` and the ``file_key`` is a path (relative to
  ``file_key_base`` when set, else absolute), matching the server's
  ``saveFile`` contract so the canvas can read them via ``/api/uploads``.

``get`` returns the bytes for a key the store owns, else ``None`` (so the
filesystem/URL resolver in :mod:`assets` handles plain file_keys / URLs).
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Optional, Protocol


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
        key = f"{self.SCHEME}{uuid.uuid4().hex}"
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
        self.out_dir.mkdir(parents=True, exist_ok=True)
        path = self.out_dir / f"{uuid.uuid4().hex}.{ext.lstrip('.') or 'bin'}"
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
