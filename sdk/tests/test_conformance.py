"""Engine conformance suite: the Python half.

The fixtures in ``packages/tongflow/conformance/*.json`` are shared with the
TypeScript engine (``packages/tongflow/src/engine/conformance.test.ts``); both
engines must produce the fixture's ``expected`` result and events. Each
fixture holds an exported ``ExecutableWorkflow``, fake plugins declared as
data (``plugins``: plugin id -> list of steps), seeded files (``assets``),
runtime ``inputs`` and the ``expected`` outcome. The Python engine is the
reference: ``python tests/test_conformance.py --record`` rewrites every
fixture's ``expected`` from the current Python semantics.

Fixtures flagged ``"engines": ["ts"]`` cover semantics only the TypeScript
engine implements so far (the ``branch`` failure policy, pause / resume, skip
and replace-and-rerun through a run controller). They are skipped here and
never recorded; the Python engine will follow in a later change.

The fake plugins run through ``run_workflow(invoker=...)``; the step
interpreter below is mirrored by ``src/engine/testing/fake-plugins.ts``.
"""

from __future__ import annotations

import base64
import json
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Optional
from unittest import mock

import pytest

if __name__ == "__main__":
    # Recording runs this file directly: import the checkout's SDK, not an
    # installed tongflow.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tongflow.engine import run_workflow  # noqa: E402
from tongflow.engine import runner as runner_mod  # noqa: E402

CONFORMANCE_DIR = (
    Path(__file__).resolve().parents[2] / "packages" / "tongflow" / "conformance"
)

# Event fields the fixtures pin down, per event type. Anything else (labels,
# raw outputs carrying store handles) is engine-specific.
EVENT_KEYS: dict[str, tuple[str, ...]] = {
    "workflow_started": ("totalNodes", "levels"),
    "node_started": ("nodeId", "level"),
    "plugin_progress": ("nodeId", "message"),
    "node_completed": ("nodeId",),
    "node_failed": ("nodeId", "error"),
    "workflow_completed": ("status", "errors"),
    "workflow_failed": ("status", "errors"),
}


# --- fake plugin step interpreter ---------------------------------------------


def _resolve(path: str, scope: Any) -> Any:
    cur = scope
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        if (
            part == "text"
            and "text" not in cur
            and isinstance(cur.get("bytesBase64"), str)
        ):
            cur = base64.b64decode(cur["bytesBase64"]).decode("utf-8")
            continue
        cur = cur.get(part)
    return cur


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return ",".join(_stringify(v) for v in value)
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True, separators=(",", ":"))
    return str(value)


def _format(template: str, scope: Any) -> str:
    return re.sub(
        r"\{([^{}]+)\}", lambda m: _stringify(_resolve(m.group(1), scope)), template
    )


def _make_asset(step: dict[str, Any], scope: dict[str, Any]) -> dict[str, Any]:
    content = _format(step["content"], scope).encode("utf-8")
    asset: dict[str, Any] = {"bytesBase64": base64.b64encode(content).decode("ascii")}
    for key in ("mime", "filename"):
        if step.get(key):
            value = _format(step[key], scope)
            if value:
                asset[key] = value
    return asset


def run_fake_plugin(
    steps: list[dict[str, Any]], prompt: dict[str, Any], model: Optional[str]
) -> dict[str, Any]:
    scope = {**prompt, "_model": model}
    out: dict[str, Any] = {"success": True}
    for step in steps:
        when = step.get("when")
        if when and _stringify(_resolve(when["field"], scope)) != when["equals"]:
            continue
        op = step["op"]
        field = step.get("field")
        if op == "set":
            out[field] = step["value"]
        elif op == "format":
            out[field] = _format(step["template"], scope)
        elif op == "join":
            value = _resolve(step["from"], scope)
            items = value if isinstance(value, list) else [value]
            out[field] = step.get("sep", "").join(_stringify(v) for v in items)
        elif op == "map":
            value = _resolve(step["from"], scope)
            items = value if isinstance(value, list) else [value]
            out[field] = [
                _format(step["template"], {**scope, "item": v}) for v in items
            ]
        elif op == "asset":
            out[field] = _make_asset(step, scope)
        elif op == "assets":
            out[field] = [
                _make_asset(step, {**scope, "i": i})
                for i in range(1, int(step["count"]) + 1)
            ]
        elif op == "fail":
            return {"success": False, "error": _format(step["error"], scope)}
        elif op == "raise":
            raise RuntimeError(_format(step["error"], scope))
        else:
            raise ValueError(f"unknown fake plugin op {op!r}")
    return out


# --- fixture runner -------------------------------------------------------------


def _asset_bytes(spec: dict[str, Any]) -> bytes:
    if "bytesBase64" in spec:
        return base64.b64decode(spec["bytesBase64"])
    return str(spec["text"]).encode("utf-8")


def _project_event(event: dict[str, Any]) -> Optional[dict[str, Any]]:
    keys = EVENT_KEYS.get(event.get("type", ""))
    if keys is None:
        return None
    return {"type": event["type"], **{k: event[k] for k in keys if k in event}}


def run_fixture(fixture: dict[str, Any], work_dir: Path) -> dict[str, Any]:
    plugins: dict[str, list[dict[str, Any]]] = fixture["plugins"]
    plugins_dir = work_dir / "plugins"
    for plugin_id in plugins:
        (plugins_dir / plugin_id).mkdir(parents=True, exist_ok=True)
    files_dir = work_dir / "files"
    for key, spec in (fixture.get("assets") or {}).items():
        path = files_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_asset_bytes(spec))

    manifest = {
        "plugins": {
            pid: {"localSubdir": pid, "entryFile": "entry.py", "methodsByNodeSlot": {}}
            for pid in plugins
        }
    }

    def invoker(plugin_id, node_slot, prompt, plugin_dir, model):  # noqa: ARG001
        return run_fake_plugin(plugins[plugin_id], prompt, model)

    events: list[dict[str, Any]] = []
    with mock.patch.object(runner_mod, "scan_manifest", lambda _pd, _abi: manifest):
        result = run_workflow(
            fixture["workflow"],
            fixture.get("inputs") or {},
            plugins_dir=plugins_dir,
            data_dir=work_dir / "data",
            file_key_base=files_dir,
            inline_outputs=True,
            auto_install=False,
            on_progress=events.append,
            invoker=invoker,
        )
    projected = [p for p in (_project_event(e) for e in events) if p is not None]
    return {
        "status": result["status"],
        "outputs": result["outputs"],
        "outputsByName": result["outputs_by_name"],
        "errors": result["errors"],
        "failures": result["failures"],
        "events": projected,
    }


def _fixture_paths() -> list[Path]:
    if not CONFORMANCE_DIR.is_dir():
        return []
    return sorted(CONFORMANCE_DIR.glob("*.json"))


def _runs_on_python(fixture: dict[str, Any]) -> bool:
    engines = fixture.get("engines")
    return engines is None or "python" in engines


@pytest.mark.skipif(
    not _fixture_paths(), reason="conformance fixtures live in the repo checkout"
)
@pytest.mark.parametrize("path", _fixture_paths(), ids=lambda p: p.stem)
def test_conformance_fixture(path: Path, tmp_path: Path) -> None:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    if not _runs_on_python(fixture):
        pytest.skip(f"TypeScript-only fixture (engines={fixture['engines']})")
    assert "expected" in fixture, f"{path.name} has no expected block"
    assert run_fixture(fixture, tmp_path) == fixture["expected"]


def test_fixture_suite_covers_the_required_cases() -> None:
    names = {p.stem for p in _fixture_paths()}
    if not names:
        pytest.skip("conformance fixtures live in the repo checkout")
    required = {
        "linear-chain",
        "batch-fan-out",
        "collect-all",
        "expand-each-assets",
        "asset-roundtrip",
        "failure-abort",
        "multi-level-dag",
    }
    assert required <= names


def _record() -> None:
    """Rewrite every fixture's ``expected`` block from the Python engine."""
    for path in _fixture_paths():
        fixture = json.loads(path.read_text(encoding="utf-8"))
        if not _runs_on_python(fixture):
            print(f"skipped {path.name}: TypeScript-only")
            continue
        with tempfile.TemporaryDirectory() as tmp:
            fixture["expected"] = run_fixture(fixture, Path(tmp))
        path.write_text(
            json.dumps(fixture, indent=4, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"recorded {path.name}: {fixture['expected']['status']}")


if __name__ == "__main__":
    if "--record" in sys.argv[1:]:
        _record()
    else:
        print("usage: python tests/test_conformance.py --record")
