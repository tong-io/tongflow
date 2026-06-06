"""Generic local entry for Modal-backed plugins.

In the unified plugin model the platform invokes *every* plugin the same way:
it spawns ``python entry.py`` in the plugin directory, writes
``{"nodeSlot", "prompt", "taskId"}`` to stdin, and reads the ABI-JSON result
from stdout. A Modal plugin's ``entry.py`` is therefore just::

    from tongflow.modal_entry import main
    raise SystemExit(main())

This module owns everything Modal-specific that used to live in the platform's
``runners/modal.ts``: discovering which class/method serves the requested slot,
ensuring the app is deployed, invoking the deployed method remotely, streaming
progress, and cancelling the remote call on SIGTERM. The platform stays
backend-neutral — it only knows "spawn the entry, exchange JSON".

The remote call goes through the Python ``modal`` SDK, so ``modal`` must be
importable in the local environment (it already is for any Modal plugin author).
"""

from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any

from .parse_deploy import _slot_to_ident, parse_deploy_py
from .progress import progress

DEPLOY_FILE = "deploy.py"
DOWNLOAD_FILE = "download.py"

# Hard cap on waiting for remote GPU work; keep in line with the heaviest
# plugin's own Modal function timeout. Overridable via env.
_CALL_TIMEOUT_S = float(os.environ.get("TONGFLOW_MODAL_CALL_TIMEOUT_S", 40 * 60))


def _cache_dir() -> Path:
    base = os.environ.get("TONGFLOW_MODAL_CACHE_DIR")
    d = Path(base) if base else (Path.home() / ".tongflow" / "modal-cache")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _file_hash(path: Path) -> str | None:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def _cache_path(app_name: str) -> Path:
    return _cache_dir() / f"{app_name}.json"


def _load_cache(app_name: str) -> dict[str, Any]:
    try:
        return json.loads(_cache_path(app_name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save_cache(app_name: str, data: dict[str, Any]) -> None:
    try:
        _cache_path(app_name).write_text(json.dumps(data), encoding="utf-8")
    except OSError:
        pass  # cache is best-effort; a write failure just means we re-run next time


def _discover(node_slot: str) -> tuple[str, str, str]:
    """Return (app_name, cls_name, method_name) for ``node_slot``.

    Discovery is by AST scan of the local ``deploy.py`` (no import side effects),
    reusing the same parser the platform scanner uses. The Modal app name is the
    plugin directory name, matching ``current_app``.
    """
    deploy_path = Path(DEPLOY_FILE)
    if not deploy_path.is_file():
        raise RuntimeError(f"missing {DEPLOY_FILE} in {Path.cwd()}")

    scan, err = parse_deploy_py(deploy_path)
    if err or scan is None:
        raise RuntimeError(err or "failed to parse deploy.py")

    ident = _slot_to_ident(node_slot)
    method_name = scan.methods_by_slot.get(ident)
    if not method_name:
        raise RuntimeError(f"deploy.py does not implement nodeSlot={node_slot!r}")
    cls_name = scan.cls_by_slot.get(ident, scan.cls_name)

    app_name = Path.cwd().resolve().name
    return app_name, cls_name, method_name


def _run_modal_cli(args: list[str], label: str) -> None:
    progress(f"Modal: {label}")
    proc = subprocess.run(  # noqa: S603
        [sys.executable, "-m", "modal", *args],
        cwd=str(Path.cwd()),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip()[-2000:]
        raise RuntimeError(f"{label} failed (exit {proc.returncode}): {tail}")


def _ensure_weights(app_name: str) -> None:
    """Run `modal run download::download` once per download.py content."""
    dl = Path(DOWNLOAD_FILE)
    if not dl.is_file():
        return
    h = _file_hash(dl)
    cache = _load_cache(app_name)
    if cache.get("downloadHash") == h:
        return
    _run_modal_cli(["run", f"{DOWNLOAD_FILE}::download"], "downloading weights")
    cache["downloadHash"] = h
    _save_cache(app_name, cache)


def _ensure_deployed(app_name: str) -> None:
    """Deploy once per deploy.py content (proactively picks up deploy.py edits)."""
    h = _file_hash(Path(DEPLOY_FILE))
    cache = _load_cache(app_name)
    if cache.get("deployHash") == h:
        return
    _deploy(app_name)


def _deploy(app_name: str) -> None:
    _run_modal_cli(["deploy", DEPLOY_FILE], "deploying")
    cache = _load_cache(app_name)
    cache["deployHash"] = _file_hash(Path(DEPLOY_FILE))
    _save_cache(app_name, cache)


def _invoke(app_name: str, cls_name: str, method_name: str, prompt: dict[str, Any]) -> Any:
    import modal

    progress(f"Modal: invoking {method_name}()")
    cls = modal.Cls.from_name(app_name, cls_name)
    instance = cls()
    fn = getattr(instance, method_name)

    # Spawn so we hold a handle we can cancel on SIGTERM (platform sends it on
    # task cancellation), then block on the result with a hard timeout.
    call = fn.spawn(prompt)

    def _on_term(_signo: int, _frame: Any) -> None:
        try:
            call.cancel()
        finally:
            raise SystemExit(130)

    signal.signal(signal.SIGTERM, _on_term)
    return call.get(timeout=_CALL_TIMEOUT_S)


def run(node_slot: str, prompt: dict[str, Any]) -> Any:
    app_name, cls_name, method_name = _discover(node_slot)

    # Both steps are cached by file content, so a warm plugin goes straight to
    # the remote invoke.
    _ensure_weights(app_name)
    _ensure_deployed(app_name)

    try:
        return _invoke(app_name, cls_name, method_name, prompt)
    except Exception as e:
        # The deploy cache claimed the app was live but the remote disagrees
        # (e.g. a fresh Modal account, or a method added since last deploy).
        # Force a redeploy once and retry.
        if _looks_like_not_deployed(e):
            _deploy(app_name)
            return _invoke(app_name, cls_name, method_name, prompt)
        raise


def _looks_like_not_deployed(err: Exception) -> bool:
    msg = str(err).lower()
    return "not found" in msg or "deploy" in msg or "no such" in msg


def main() -> int:
    try:
        raw = sys.stdin.read()
        req = json.loads(raw) if raw.strip() else {}
        node_slot = str(req.get("nodeSlot") or "")
        prompt = req.get("prompt") if isinstance(req.get("prompt"), dict) else {}
        if not node_slot:
            raise RuntimeError("missing nodeSlot")
        out = run(node_slot, prompt)
    except SystemExit:
        raise
    except Exception as e:  # surfaced to the UI as an ABI failure
        sys.stdout.write(json.dumps({"success": False, "error": str(e)}))
        sys.stdout.flush()
        return 1

    sys.stdout.write(json.dumps(out, ensure_ascii=False))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
