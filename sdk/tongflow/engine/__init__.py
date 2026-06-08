"""Standalone workflow execution engine.

Interprets an exported ``ExecutableWorkflow`` JSON in pure Python so TongFlow can
be embedded as an execution engine, with no running desktop app. Backend-neutral:
plugins are invoked by spawning their local ``entry.py`` (a deploy-first plugin's
bridge still reaches its remote backend).
"""

from __future__ import annotations

from .runner import run_workflow

__all__ = ["run_workflow"]
