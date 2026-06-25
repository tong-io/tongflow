"""Invoke a plugin by spawning its local ``entry.py``.

Direct translation of ``execPlugin`` in
``src/lib/plugin-executor/runners/generic.ts``: write a single JSON payload to
the child's stdin, read the single ABI-JSON object from stdout, and parse
sentinel-framed progress lines from stderr in real time (everything else on
stderr is ordinary log output).

The plugin's ``entry.py`` is the same bridge the desktop app spawns, so a
deploy-first plugin's bridge still deploys-once and invokes its remote backend.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable, Optional

from ..progress import PROGRESS_SENTINEL
from ._subproc import utf8_env

ProgressCb = Callable[[dict[str, Any]], None]


def parse_progress_line(line: str) -> Optional[dict[str, Any]]:
    """Mirror ``parseProgressLine`` from ``progress-protocol.ts``."""
    idx = line.find(PROGRESS_SENTINEL)
    if idx == -1:
        return None
    body = line[idx + len(PROGRESS_SENTINEL) :].strip()
    if not body:
        return None
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    message = parsed.get("message")
    if not isinstance(message, str) or not message:
        return None
    out: dict[str, Any] = {"message": message}
    percent = parsed.get("percent")
    if isinstance(percent, (int, float)):
        out["percent"] = percent
    return out


def _try_parse_abi_output(stdout: str) -> Optional[dict[str, Any]]:
    trimmed = stdout.strip()
    if not trimmed:
        return None
    try:
        parsed = json.loads(trimmed)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def invoke_plugin(
    *,
    python: str,
    plugin_dir: Path,
    entry_file: str,
    plugin_id: str,
    node_slot: str,
    prompt: dict[str, Any],
    sdk_root: Path,
    task_id: str = "tongflow-engine",
    env_extra: Optional[dict[str, str]] = None,
    on_progress: Optional[ProgressCb] = None,
) -> dict[str, Any]:
    payload = json.dumps(
        {
            "pluginId": plugin_id,
            "nodeSlot": node_slot,
            "taskId": task_id,
            "prompt": prompt,
        }
    )

    env = utf8_env()
    python_path_parts = [str(sdk_root)]
    if env.get("PYTHONPATH"):
        python_path_parts.append(env["PYTHONPATH"])
    env["PYTHONPATH"] = os.pathsep.join(python_path_parts)
    if env_extra:
        env.update(env_extra)

    proc = subprocess.Popen(
        [python, entry_file],
        cwd=str(plugin_dir),
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    stderr_log: list[str] = []

    def _pump_stderr() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            line = line.rstrip("\n")
            prog = parse_progress_line(line)
            if prog is not None:
                if on_progress is not None:
                    on_progress({"type": "plugin_progress", "pluginId": plugin_id, **prog})
                continue
            stderr_log.append(line)

    stderr_thread = threading.Thread(target=_pump_stderr, daemon=True)
    stderr_thread.start()

    assert proc.stdin is not None
    proc.stdin.write(payload)
    proc.stdin.close()

    assert proc.stdout is not None
    stdout = proc.stdout.read()
    code = proc.wait()
    stderr_thread.join(timeout=5)

    parsed = _try_parse_abi_output(stdout)
    if parsed is not None:
        return parsed

    err_text = "\n".join(stderr_log).strip()
    if code == 0:
        raise RuntimeError(f"Plugin produced non-JSON stdout: {stdout[:200]}")
    raise RuntimeError(f"Plugin failed (exit={code}). {err_text}")
