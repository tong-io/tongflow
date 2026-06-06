from __future__ import annotations

from pathlib import Path
from typing import Any

import modal


def current_app(file_path: str, **kwargs: Any) -> modal.App:
    """Create the plugin Modal app from the plugin directory name."""
    return modal.App(Path(file_path).resolve().parent.name, **kwargs)
