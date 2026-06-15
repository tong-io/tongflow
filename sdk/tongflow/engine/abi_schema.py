"""ABI schema access for the workflow engine.

The engine needs the full per-slot input/output JSON Schemas (to find `$ref`
Asset / FileRef fields), which is more than :mod:`tongflow.abi` exposes. This
module loads `tongflow.abi.json` and offers small schema predicates that mirror
the server-side TypeScript helpers byte-for-byte:

- ``schema_is_asset``  -> ``prepare-asset-input.server.ts`` (`#/$defs/Asset`)
- ``schema_is_file_ref`` -> ``convert-output-fileref.ts`` (FileRef family)
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Iterator, Optional, Union

ASSET_REF = "#/$defs/Asset"

# Output `$ref`s the server materializes from `bytesBase64` into a `{file_key}`.
FILE_REF_REFS = frozenset(
    {
        "#/$defs/FileRef",
        "#/$defs/ImageRef",
        "#/$defs/VideoRef",
        "#/$defs/AudioRef",
    }
)


def _candidate_abi_paths() -> Iterator[Path]:
    env = os.environ.get("TONGFLOW_ABI_PATH", "").strip()
    if env:
        yield Path(env)
    # Bundled with the SDK (so a pip-installed tongflow can run standalone).
    yield Path(__file__).resolve().parent.parent / "_data" / "tongflow.abi.json"
    # Repo / self-hosted layout.
    yield Path.cwd() / "config" / "tongflow.abi.json"


def resolve_abi_path(explicit: Optional[Union[str, Path]] = None) -> Path:
    """Locate `tongflow.abi.json`. Order: explicit arg, env, bundled, repo cwd."""
    if explicit:
        p = Path(explicit)
        if p.is_file():
            return p
        raise FileNotFoundError(f"ABI not found at {p}")
    for c in _candidate_abi_paths():
        if c.is_file():
            return c
    raise FileNotFoundError(
        "Could not locate tongflow.abi.json; pass abi_path= or set TONGFLOW_ABI_PATH"
    )


class AbiSchema:
    """Per-slot input/output schema lookup."""

    def __init__(self, nodes_by_slot: dict[str, dict[str, Any]]):
        self._by_slot = nodes_by_slot

    def has_slot(self, slot: str) -> bool:
        return slot in self._by_slot

    def inputs(self, slot: str) -> dict[str, Any]:
        node = self._by_slot.get(slot) or {}
        out = node.get("inputs")
        return out if isinstance(out, dict) else {}

    def outputs(self, slot: str) -> dict[str, Any]:
        node = self._by_slot.get(slot) or {}
        out = node.get("outputs")
        return out if isinstance(out, dict) else {}


def load_abi_schema(path: Optional[Union[str, Path]] = None) -> AbiSchema:
    p = resolve_abi_path(path)
    raw: dict[str, Any] = json.loads(p.read_text(encoding="utf-8"))
    by_slot: dict[str, dict[str, Any]] = {}
    for n in raw.get("nodes", []):
        if isinstance(n, dict) and isinstance(n.get("nodeSlot"), str):
            by_slot[n["nodeSlot"]] = n
    return AbiSchema(by_slot)


def schema_is_asset(schema: Any) -> bool:
    return isinstance(schema, dict) and schema.get("$ref") == ASSET_REF


def schema_is_file_ref(schema: Any) -> bool:
    return isinstance(schema, dict) and schema.get("$ref") in FILE_REF_REFS


def array_items_are_asset(schema: Any) -> bool:
    return (
        isinstance(schema, dict)
        and schema.get("type") == "array"
        and schema_is_asset(schema.get("items"))
    )


def array_items_are_file_ref(schema: Any) -> bool:
    return (
        isinstance(schema, dict)
        and schema.get("type") == "array"
        and schema_is_file_ref(schema.get("items"))
    )
