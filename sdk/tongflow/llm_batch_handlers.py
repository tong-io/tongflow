"""Deterministic batch helpers for LLM-runner plugins (no remote LLM)."""

from __future__ import annotations

import math
from typing import Any


def drop_video_output(prompt: dict[str, Any]) -> dict[str, Any]:
    keys_raw = prompt.get("fileKeys")
    keys: list[str] = (
        [str(x) for x in keys_raw if isinstance(x, str) and x.strip()]
        if isinstance(keys_raw, list)
        else []
    )
    query = str(prompt.get("query") or "").strip().lower()
    clips: list[dict[str, Any]] = []
    for fk in keys:
        keep = True
        if query:
            keep = query in fk.lower()
        clips.append({"keep": keep, "fileKey": fk})
    return {"success": True, "clips": clips}


def arrange_group_output(prompt: dict[str, Any]) -> dict[str, Any]:
    keys_raw = prompt.get("fileKeys")
    keys: list[str] = (
        [str(x) for x in keys_raw if isinstance(x, str) and x.strip()]
        if isinstance(keys_raw, list)
        else []
    )
    gc_raw = prompt.get("groupCount")
    try:
        gc = int(gc_raw) if gc_raw is not None else 3
    except (TypeError, ValueError):
        gc = 3
    gc = max(1, gc)

    if not keys:
        return {"success": True, "groups": []}

    k = min(gc, len(keys))
    chunk = max(1, math.ceil(len(keys) / k))
    groups: list[list[str]] = []
    i = 0
    while i < len(keys):
        groups.append(keys[i : i + chunk])
        i += chunk
    return {"success": True, "groups": groups}
