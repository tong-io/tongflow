"""Tongflow plugin convention + deploy scan (no per-repo JSON).

Backend-neutral: this package imports no backend SDK (no ``modal``). A plugin
that runs on a deploy-first backend marks its handler class with ``@deploy`` and
ships its own local bridge (``entry.py``) that imports the backend lazily.
"""

from __future__ import annotations

from .deploy_marker import deploy
from .engine import run_workflow
from .progress import progress

__version__ = "0.1.2"

__all__ = ["deploy", "progress", "run_workflow"]
