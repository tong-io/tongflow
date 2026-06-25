"""Subprocess helpers shared across the engine.

Force UTF-8 I/O on spawned child processes (plugin entries, pip, git). On a
non-UTF-8 system locale — e.g. Windows Simplified-Chinese, whose ANSI code page
is GBK / cp936 — a child Python's stdout/stderr default to that locale encoding,
so printing a non-ASCII character such as the "✓" (U+2713) many libraries emit
while downloading model weights crashes with
``UnicodeEncodeError: 'gbk' codec can't encode character``.

``PYTHONUTF8=1`` enables Python's UTF-8 Mode (3.7+), which makes the standard
streams and the default text encoding UTF-8 regardless of locale;
``PYTHONIOENCODING`` is a belt-and-suspenders fallback for older interpreters.
"""

from __future__ import annotations

import os
from typing import Optional


def utf8_env(base: Optional[dict[str, str]] = None) -> dict[str, str]:
    """Return an environment dict with Python UTF-8 mode forced on.

    Copies ``base`` (or the current process environment) and sets the UTF-8
    knobs. Use for every spawned Python/pip subprocess so a non-UTF-8 locale
    does not break non-ASCII output.
    """
    env = dict(base) if base is not None else os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env
