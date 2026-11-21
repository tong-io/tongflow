"""Scanner + engine tests for browser edge plugins (`tongflow-edge-*`).

An edge plugin is a TypeScript package with no entry.py; its
`tongflow.plugin.json` declares `runtime: "browser"`, an ESM `entry` and the
slots it implements. The scanner turns that into a registry entry tagged
`runtime: "browser"`; the Python engine refuses to run it.
"""

from __future__ import annotations

import json
from pathlib import Path

from tongflow.engine import run_workflow
from tongflow.engine import plugins as plugins_mod
from tongflow.engine import runner as runner_mod
from tongflow.scan import scan

_ABI = {
    "version": 1,
    "$defs": {"Asset": {"type": "object"}},
    "nodes": [
        {
            "nodeSlot": "ocr-image",
            "inputs": {
                "type": "object",
                "properties": {"image": {"$ref": "#/$defs/Asset"}},
            },
            "outputs": {
                "type": "object",
                "properties": {
                    "success": {"type": "boolean"},
                    "text": {"type": "string"},
                },
            },
        },
        {
            "nodeSlot": "gen-text",
            "inputs": {"type": "object", "properties": {"text": {"type": "string"}}},
            "outputs": {
                "type": "object",
                "properties": {
                    "success": {"type": "boolean"},
                    "text": {"type": "string"},
                },
            },
        },
    ],
}

_PY_HANDLERS = '''
from tongflow.slots import node_slot, NodeSlots
from tongflow.models.gen_text import GenTextInput, GenTextOutput

@node_slot(NodeSlots.GEN_TEXT)
def gen_text(input: GenTextInput) -> GenTextOutput:
    ...
'''

_EDGE_ID = "tongflow-edge-essentials"


def _write_abi(tmp_path: Path) -> Path:
    p = tmp_path / "abi.json"
    p.write_text(json.dumps(_ABI), encoding="utf-8")
    return p


def _write_edge(
    root: Path,
    manifest: dict | str | None,
    *,
    plugin_id: str = _EDGE_ID,
    entry_file: str | None = "dist/index.js",
) -> Path:
    pdir = root / plugin_id
    pdir.mkdir(parents=True)
    if entry_file:
        (pdir / entry_file).parent.mkdir(parents=True, exist_ok=True)
        (pdir / entry_file).write_text("export {};\n", encoding="utf-8")
    if manifest is not None:
        text = manifest if isinstance(manifest, str) else json.dumps(manifest)
        (pdir / "tongflow.plugin.json").write_text(text, encoding="utf-8")
    return pdir


def _manifest(**over: object) -> dict:
    m: dict = {
        "plugin": {"name": "Edge essentials"},
        "runtime": "browser",
        "entry": "dist/index.js",
        "slots": [
            {"nodeSlot": "ocr-image", "method": "ocrImage", "models": ["pp-ocrv6"]},
            {"nodeSlot": "gen-text", "method": "genText"},
        ],
    }
    m.update(over)
    return m


def _messages(payload: dict, plugin_id: str = _EDGE_ID) -> list[str]:
    return [e["message"] for e in payload["errors"] if e["pluginId"] == plugin_id]


# --- scanner ----------------------------------------------------------------


def test_edge_manifest_builds_browser_entry(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(root, _manifest())
    payload = scan(root, _write_abi(tmp_path))

    assert payload["errors"] == []
    assert payload["plugins"][_EDGE_ID] == {
        "localSubdir": _EDGE_ID,
        "methodsByNodeSlot": {
            "ocr-image": {"methodName": "ocrImage", "models": ["pp-ocrv6"]},
            "gen-text": {"methodName": "genText"},
        },
        "entryFile": "dist/index.js",
        "needsDeploy": False,
        "runtime": "browser",
    }
    assert payload["nodePluginMap"]["ocr-image"] == [_EDGE_ID]
    assert payload["nodePluginMap"]["gen-text"] == [_EDGE_ID]


def test_python_plugins_are_tagged_python(tmp_path):
    root = tmp_path / "plugins"
    pdir = root / "tongflow-api-fake"
    pdir.mkdir(parents=True)
    (pdir / "entry.py").write_text(_PY_HANDLERS, encoding="utf-8")
    _write_edge(root, _manifest())
    payload = scan(root, _write_abi(tmp_path))

    assert payload["errors"] == []
    assert payload["plugins"]["tongflow-api-fake"]["runtime"] == "python"
    # Both implementations are listed for the shared slot, in directory order.
    assert payload["nodePluginMap"]["gen-text"] == ["tongflow-api-fake", _EDGE_ID]


def test_edge_unknown_slot_is_reported_and_skipped(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(
        root,
        _manifest(
            slots=[
                {"nodeSlot": "no-such-slot", "method": "nope"},
                {"nodeSlot": "ocr-image", "method": "ocrImage"},
            ]
        ),
    )
    payload = scan(root, _write_abi(tmp_path))

    msgs = _messages(payload)
    assert len(msgs) == 1
    assert "unknown nodeSlot 'no-such-slot' (not in tongflow.abi.json)" in msgs[0]
    assert "tongflow.plugin.json:1:" in msgs[0]
    assert "; fix: " in msgs[0]
    # The valid slot still registers.
    assert payload["plugins"][_EDGE_ID]["methodsByNodeSlot"] == {
        "ocr-image": {"methodName": "ocrImage"}
    }
    assert "no-such-slot" not in payload["nodePluginMap"]


def test_edge_only_unknown_slots_drops_the_plugin(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(root, _manifest(slots=[{"nodeSlot": "nope", "method": "x"}]))
    payload = scan(root, _write_abi(tmp_path))

    assert _EDGE_ID not in payload["plugins"]
    assert any("unknown nodeSlot 'nope'" in m for m in _messages(payload))


def test_edge_missing_entry_field(tmp_path):
    root = tmp_path / "plugins"
    m = _manifest()
    del m["entry"]
    _write_edge(root, m)
    payload = scan(root, _write_abi(tmp_path))

    assert _EDGE_ID not in payload["plugins"]
    msgs = _messages(payload)
    assert len(msgs) == 1 and "missing entry" in msgs[0]


def test_edge_entry_file_not_found(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(root, _manifest(), entry_file=None)
    payload = scan(root, _write_abi(tmp_path))

    assert _EDGE_ID not in payload["plugins"]
    msgs = _messages(payload)
    assert len(msgs) == 1 and "entry file 'dist/index.js' not found" in msgs[0]


def test_edge_entry_must_stay_inside_plugin_dir(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(root, _manifest(entry="../outside.js"))
    payload = scan(root, _write_abi(tmp_path))

    assert _EDGE_ID not in payload["plugins"]
    assert any("inside the plugin directory" in m for m in _messages(payload))


def test_edge_missing_manifest(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(root, None)
    payload = scan(root, _write_abi(tmp_path))

    assert _EDGE_ID not in payload["plugins"]
    assert any("missing tongflow.plugin.json" in m for m in _messages(payload))


def test_edge_invalid_json(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(root, "{not json")
    payload = scan(root, _write_abi(tmp_path))

    assert _EDGE_ID not in payload["plugins"]
    assert any("not valid JSON" in m for m in _messages(payload))


def test_edge_wrong_runtime(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(root, _manifest(runtime="python"))
    payload = scan(root, _write_abi(tmp_path))

    assert _EDGE_ID not in payload["plugins"]
    assert any("must declare runtime 'browser'" in m for m in _messages(payload))


def test_edge_bad_slot_entries(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(
        root,
        _manifest(
            slots=[
                {"nodeSlot": "ocr-image"},
                {"nodeSlot": "gen-text", "method": "genText", "models": []},
                {"nodeSlot": "gen-text", "method": "again"},
            ]
        ),
    )
    payload = scan(root, _write_abi(tmp_path))

    msgs = _messages(payload)
    assert any("(ocr-image) is missing method" in m for m in msgs)
    assert any("models must be a non-empty list" in m for m in msgs)
    assert any("'gen-text' is declared more than once" in m for m in msgs)
    # A bad models list drops only the models, not the slot.
    assert payload["plugins"][_EDGE_ID]["methodsByNodeSlot"] == {
        "gen-text": {"methodName": "genText"}
    }


def test_edge_prefix_must_be_lowercase(tmp_path):
    root = tmp_path / "plugins"
    _write_edge(root, _manifest(), plugin_id="tongflow-edge-Essentials")
    payload = scan(root, _write_abi(tmp_path))

    msgs = _messages(payload, "tongflow-edge-Essentials")
    assert len(msgs) == 1 and "must be all lowercase" in msgs[0]


# --- engine -----------------------------------------------------------------


def _workflow(plugin_id: str) -> dict:
    dn_id, exec_id = "dn-1", "exec-1"
    return {
        "name": "t",
        "version": "1.0",
        "inputs": [],
        "outputs": [],
        "dataNodes": [
            {
                "id": dn_id,
                "type": "textNode",
                "dataType": "text",
                "staticData": {"texts": ["hello"]},
                "level": 0,
            }
        ],
        "executableNodes": [
            {
                "id": exec_id,
                "type": "genTextNode",
                "feature": "gen-text",
                "pluginId": plugin_id,
                "bindings": {
                    "text": {
                        "kind": "handle",
                        "consumerShape": "scalar",
                        "sources": [{"fromNodeId": dn_id, "fromField": "texts"}],
                    }
                },
                "outputs": [],
                "dependencies": [dn_id],
                "level": 1,
            }
        ],
        "executionLevels": [[dn_id], [exec_id]],
        "dataNodeEdges": [],
    }


def test_engine_refuses_installed_browser_plugin(tmp_path):
    plugins_dir = tmp_path / "plugins"
    _write_edge(plugins_dir, _manifest())
    events: list[dict] = []
    result = run_workflow(
        _workflow(_EDGE_ID),
        plugins_dir=plugins_dir,
        data_dir=tmp_path / "data",
        abi_path=_write_abi(tmp_path),
        auto_install=False,
        on_progress=events.append,
    )

    assert result["status"] != "success"
    failed = [e for e in events if e["type"] == "node_failed"]
    assert len(failed) == 1
    assert "requires the browser edge runtime" in failed[0]["error"]
    assert _EDGE_ID in failed[0]["error"]


def test_engine_never_clones_missing_edge_plugin(tmp_path, monkeypatch):
    cloned: list[str] = []
    monkeypatch.setattr(
        plugins_mod,
        "_clone_plugin",
        lambda pid, *_a, **_k: cloned.append(pid),
    )
    # No venv provisioning in a unit test (it would pip-install from PyPI).
    monkeypatch.setattr(
        runner_mod, "prepare_python_env", lambda *_a, **_k: "python"
    )
    events: list[dict] = []
    result = run_workflow(
        _workflow(_EDGE_ID),
        plugins_dir=tmp_path / "plugins",
        data_dir=tmp_path / "data",
        abi_path=_write_abi(tmp_path),
        auto_install=True,
        on_progress=events.append,
    )

    assert cloned == []
    assert result["status"] != "success"
    failed = [e for e in events if e["type"] == "node_failed"]
    assert "requires the browser edge runtime" in failed[0]["error"]
