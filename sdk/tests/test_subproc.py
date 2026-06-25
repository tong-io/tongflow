from __future__ import annotations

from tongflow.engine._subproc import utf8_env


def test_utf8_env_forces_python_utf8_mode() -> None:
    env = utf8_env({"FOO": "bar"})
    assert env["PYTHONUTF8"] == "1"
    assert env["PYTHONIOENCODING"] == "utf-8"
    # Existing keys in the base are preserved.
    assert env["FOO"] == "bar"


def test_utf8_env_overrides_locale_encoding_from_base() -> None:
    # A non-UTF-8 locale (e.g. Windows GBK / cp936) must not survive: the
    # helper always wins so a spawned child prints non-ASCII (a "✓") safely.
    env = utf8_env({"PYTHONIOENCODING": "gbk", "PYTHONUTF8": "0"})
    assert env["PYTHONUTF8"] == "1"
    assert env["PYTHONIOENCODING"] == "utf-8"


def test_utf8_env_copies_base_without_mutating_it() -> None:
    base = {"FOO": "bar"}
    env = utf8_env(base)
    assert "PYTHONUTF8" not in base
    assert env is not base
