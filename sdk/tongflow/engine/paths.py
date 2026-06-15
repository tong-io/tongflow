"""Default runtime directory resolution for the standalone engine.

Mirrors the desktop app's Electron ``app.getPath("userData")`` for appName
``TongFlow`` so a pip-installed SDK shares the same plugins / venv as the desktop
app instead of polluting the caller's working directory.

Resolution order (each dir): explicit argument > env var > user-level dir.
Never defaults to cwd.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional, Union

APP_NAME = "TongFlow"


def user_data_root() -> Path:
    """The per-user app dir, matching Electron's ``app.getPath('userData')``."""
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    if sys.platform == "win32":
        base = os.environ.get("APPDATA")
        root = Path(base) if base else (Path.home() / "AppData" / "Roaming")
        return root / APP_NAME
    # Linux / other: XDG base dir spec.
    xdg = os.environ.get("XDG_DATA_HOME")
    root = Path(xdg) if xdg else (Path.home() / ".local" / "share")
    return root / APP_NAME


def resolve_data_dir(explicit: Optional[Union[str, Path]] = None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    env = os.environ.get("TONGFLOW_DATA_DIR", "").strip()
    if env:
        return Path(env).resolve()
    return (user_data_root() / "data").resolve()


def resolve_plugins_dir(explicit: Optional[Union[str, Path]] = None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    env = os.environ.get("TONGFLOW_PLUGINS_DIR", "").strip()
    if env:
        return Path(env).resolve()
    return (user_data_root() / "plugins").resolve()
