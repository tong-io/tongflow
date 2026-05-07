from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, FrozenSet

MIN_SUPPORTED_ABI_VERSION = 1


@dataclass(frozen=True)
class Abi:
    version: int
    node_slots: FrozenSet[str]
    path: Path


def load_abi(path: Path) -> Abi:
    raw: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    v = int(raw.get("version", 0))
    if v < MIN_SUPPORTED_ABI_VERSION:
        raise ValueError(
            f"Unsupported ABI version {v} in {path} "
            f"(minimum supported is {MIN_SUPPORTED_ABI_VERSION})"
        )
    nodes = raw.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        raise ValueError("ABI 'nodes' must be a non-empty list")
    slots: set[str] = set()
    for n in nodes:
        if not isinstance(n, dict):
            continue
        s = n.get("nodeSlot")
        if isinstance(s, str) and s:
            slots.add(s)
    if not slots:
        raise ValueError("No nodeSlot entries in ABI")
    return Abi(version=v, node_slots=frozenset(slots), path=path)
