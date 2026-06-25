"""Plugin preflight for the standalone engine.

Given an exported workflow, collect the ``pluginId``s it needs, clone any that
are missing, provision a shared venv (SDK + each plugin's ``requirements.txt``),
and scan the plugins directory into a manifest the invoker uses.

Mirrors the desktop app's behavior:
- clone/update  -> ``plugins-install.server.ts`` (here via system ``git``)
- shared venv   -> ``plugin-python-env.server.ts`` (hash-marker caching)
- manifest scan -> reuses :func:`tongflow.scan.scan`

Plugin git URL convention matches ``official-plugins.server.ts``:
``{org}/{pluginId}.git`` (default org ``https://github.com/tong-io``). Pass
``plugin_git_urls`` to override per plugin or to install non-official plugins.
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Optional

from ..scan import scan
from ._subproc import utf8_env

DEFAULT_ORG = "https://github.com/tong-io"

# The directory that contains the importable ``tongflow`` package (sdk root, the
# one with pyproject.toml). engine -> tongflow -> sdk.
SDK_ROOT = Path(__file__).resolve().parents[2]

LogCb = Callable[[str], None]


def collect_plugin_ids(workflow: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    for node in workflow.get("executableNodes", []):
        if not isinstance(node, dict):
            continue
        pid = node.get("pluginId")
        if isinstance(pid, str) and pid.strip() and pid not in ids:
            ids.append(pid.strip())
    return ids


def _git_url_for(plugin_id: str, org: str, overrides: dict[str, str]) -> str:
    if plugin_id in overrides:
        return overrides[plugin_id]
    return f"{org.rstrip('/')}/{plugin_id}.git"


def _clone_plugin(plugin_id: str, url: str, plugins_dir: Path, log: LogCb) -> None:
    dest = plugins_dir / plugin_id
    plugins_dir.mkdir(parents=True, exist_ok=True)
    log(f"cloning plugin {plugin_id} from {url}")
    r = subprocess.run(
        ["git", "clone", "--depth", "1", url, str(dest)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=utf8_env(),
    )
    if r.returncode != 0:
        raise RuntimeError(
            f"git clone failed for {plugin_id} ({url}): {r.stderr.strip() or r.stdout.strip()}"
        )


def ensure_plugins_present(
    plugin_ids: list[str],
    plugins_dir: Path,
    *,
    auto_install: bool,
    org: str,
    plugin_git_urls: Optional[dict[str, str]],
    log: LogCb,
) -> None:
    overrides = plugin_git_urls or {}
    missing = [pid for pid in plugin_ids if not (plugins_dir / pid).is_dir()]
    if not missing:
        return
    if not auto_install:
        raise RuntimeError(
            "Missing plugins: "
            + ", ".join(missing)
            + f". Install them under {plugins_dir} or pass auto_install=True."
        )
    for pid in missing:
        _clone_plugin(pid, _git_url_for(pid, org, overrides), plugins_dir, log)


# --- shared venv (mirrors plugin-python-env.server.ts) ----------------------


def _venv_dir(data_dir: Path) -> Path:
    return data_dir / ".tongflow" / "plugin-venv"


def _venv_python(venv_dir: Path) -> Path:
    if sys.platform == "win32":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def _markers_dir(venv_dir: Path) -> Path:
    return venv_dir / ".markers"


def _hash_file(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return "none"


def _read_marker(venv_dir: Path, name: str) -> Optional[str]:
    try:
        return (_markers_dir(venv_dir) / name).read_text(encoding="utf-8").strip()
    except OSError:
        return None


def _write_marker(venv_dir: Path, name: str, value: str) -> None:
    md = _markers_dir(venv_dir)
    md.mkdir(parents=True, exist_ok=True)
    (md / name).write_text(value, encoding="utf-8")


def _run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    r = subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=utf8_env(),
    )
    return r.returncode, (r.stdout + r.stderr)


def _sdk_version() -> str:
    # Lazy import to avoid a circular import (tongflow.__init__ imports engine).
    from tongflow import __version__

    return __version__


def _ensure_shared_venv(data_dir: Path, log: LogCb) -> Path:
    venv_dir = _venv_dir(data_dir)
    py = _venv_python(venv_dir)
    version = _sdk_version()

    if py.exists() and _read_marker(venv_dir, "sdk.version") == version:
        return py

    data_dir.mkdir(parents=True, exist_ok=True)
    if not py.exists():
        log("creating shared plugin venv")
        code, out = _run([sys.executable, "-m", "venv", str(venv_dir)], data_dir)
        if code != 0:
            raise RuntimeError(f"failed to create plugin venv: {out.strip()}")

    # Always install the SDK from PyPI (pinned to this package's version) so a
    # pip-installed tongflow provisions correctly — `pip install <SDK_ROOT>`
    # only works from the repo checkout, not from site-packages.
    log(f"installing tongflow=={version} into the plugin venv")
    code, out = _run(
        [str(py), "-m", "pip", "install", f"tongflow=={version}"], venv_dir
    )
    if code != 0:
        raise RuntimeError(f"failed to install SDK into plugin venv: {out.strip()}")

    _write_marker(venv_dir, "sdk.version", version)
    return py


def _ensure_plugin_requirements(
    plugin_id: str, plugin_dir: Path, py: Path, data_dir: Path, log: LogCb
) -> None:
    req = plugin_dir / "requirements.txt"
    if not req.is_file():
        return
    venv_dir = _venv_dir(data_dir)
    h = _hash_file(req)
    marker = f"req-{plugin_id}.hash"
    if _read_marker(venv_dir, marker) == h:
        return
    log(f"installing requirements.txt for {plugin_id}")
    code, out = _run(
        [str(py), "-m", "pip", "install", "-r", str(req)], plugin_dir
    )
    if code != 0:
        raise RuntimeError(
            f"failed to install requirements for {plugin_id}: {out.strip()}"
        )
    _write_marker(venv_dir, marker, h)


def prepare_python_env(
    plugin_ids: list[str],
    plugins_dir: Path,
    data_dir: Path,
    *,
    auto_install: bool,
    log: LogCb,
) -> str:
    """Return the interpreter to run plugin entries with.

    When ``auto_install`` is set, provision a shared venv (SDK + each plugin's
    requirements). Otherwise fall back to the current interpreter and rely on
    PYTHONPATH for the SDK plus whatever deps are already importable.
    """
    if not auto_install:
        return sys.executable
    try:
        py = _ensure_shared_venv(data_dir, log)
        for pid in plugin_ids:
            _ensure_plugin_requirements(pid, plugins_dir / pid, py, data_dir, log)
        return str(py)
    except Exception as e:  # noqa: BLE001 - degrade to plain interpreter
        log(f"venv provisioning failed ({e}); falling back to current interpreter")
        return sys.executable


def scan_manifest(plugins_dir: Path, abi_path: Path) -> dict[str, Any]:
    return scan(plugins_dir, abi_path)
