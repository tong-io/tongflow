"""NDJSON bridge for hosts that embed the engine as a subprocess.

Read a single JSON request from stdin, run the workflow, and stream results to
stdout as newline-delimited JSON (NDJSON): one ``{"event": ...}`` line per
progress event, then a final ``{"result": ...}`` line (or ``{"error": ...}``).

Request shape::

    {"workflow": <executable workflow dict>,
     "inputs": {<name>: ...},
     "options": {"plugins_dir", "data_dir", "out_dir", "abi_path",
                 "file_key_base", "auto_install", "org", "task_id"}}

The TongFlow desktop app uses this to delegate workflow execution to the SDK
engine (one execution core) while keeping its own DB / SSE / abort shell. The
orchestrator process here imports no backend SDK and no pydantic — plugin
subprocesses run under the provisioned shared venv.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from .runner import run_workflow


def _emit(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    try:
        req = json.loads(sys.stdin.read())
    except Exception as e:  # noqa: BLE001
        _emit({"error": f"invalid request JSON: {e}"})
        return 1

    workflow = req.get("workflow")
    inputs = req.get("inputs") or {}
    opts = req.get("options") or {}

    if not isinstance(workflow, dict):
        _emit({"error": "request.workflow must be an object"})
        return 1

    def on_progress(event: dict[str, Any]) -> None:
        _emit({"event": event})

    try:
        result = run_workflow(
            workflow,
            inputs,
            plugins_dir=opts.get("plugins_dir"),
            data_dir=opts.get("data_dir"),
            out_dir=opts.get("out_dir"),
            abi_path=opts.get("abi_path"),
            file_key_base=opts.get("file_key_base"),
            inline_outputs=bool(opts.get("inline_outputs", True)),
            auto_install=bool(opts.get("auto_install", True)),
            org=opts.get("org") or "https://github.com/tong-io",
            plugin_git_urls=opts.get("plugin_git_urls"),
            on_progress=on_progress,
            task_id=opts.get("task_id") or "tongflow-engine",
        )
    except Exception as e:  # noqa: BLE001 - report as a final error line
        _emit({"error": str(e)})
        return 1

    _emit({"result": result})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
