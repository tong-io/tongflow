"""Backend-neutral ``@deploy`` marker.

A plugin whose handlers run on a remote backend that must be deployed before it
can be invoked marks its handler class with ``@deploy``. The plugin scanner
detects this purely by AST (it matches the decorator name), so slot discovery
needs no backend SDK installed; the marker also best-effort stamps
``__tongflow_deploy__`` for any runtime introspection.

``@deploy`` is backend-agnostic: Modal, Fly, or any other deploy-first backend
uses the same marker. The SDK therefore needs no knowledge of a specific
backend's class decorator (e.g. Modal's ``@app.cls``).

Usage (the marker goes outermost, above the backend's own class decorator)::

    from tongflow import deploy

    @deploy
    @app.cls(...)
    class Inference:
        @node_slot(NodeSlots.TRANSCRIBE)
        def transcribe_slot(self, input: TranscribeInput) -> TranscribeOutput:
            ...
"""

from __future__ import annotations

from typing import TypeVar

T = TypeVar("T")


def deploy(cls: T) -> T:
    """Mark a handler class as requiring a deploy step before execution.

    Returns the class unchanged (a backend wrapper such as ``@app.cls`` may have
    already replaced it; the stamp is best-effort and never alters behavior).
    """
    try:
        setattr(cls, "__tongflow_deploy__", True)
    except (AttributeError, TypeError):
        # Some backend wrappers forbid attribute assignment; AST detection by
        # the scanner does not rely on this stamp, so a failure here is fine.
        pass
    return cls
