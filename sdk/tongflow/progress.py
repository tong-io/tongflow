"""Backend-neutral progress reporting for plugins.

A plugin reports progress by calling :func:`progress`. It writes a single
sentinel-framed line to **stderr** (stdout is reserved for the ABI-JSON result),
which the platform's generic runner parses and forwards to the task stream.

The sentinel must stay byte-for-byte identical to the TypeScript side
(`src/lib/plugin-executor/progress-protocol.ts`).

Works regardless of where the plugin actually runs: call it from a local
adapter, from inside a Modal method, or from any other backend — the line ends
up on the subprocess stderr the platform is reading.
"""

from __future__ import annotations

import json
import sys

PROGRESS_SENTINEL = "@@TF_PROGRESS@@"


def progress(message: str, *, percent: float | None = None) -> None:
    """Emit a progress update. ``percent`` is an optional 0–100 hint."""
    payload: dict[str, object] = {"message": str(message)}
    if percent is not None:
        payload["percent"] = percent
    line = PROGRESS_SENTINEL + json.dumps(payload, ensure_ascii=False)
    # One write + flush so the line is delivered promptly and never interleaves
    # with the JSON result on stdout.
    sys.stderr.write(line + "\n")
    sys.stderr.flush()
