from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

from tongflow.engine import run_workflow
from tongflow.engine import plugins as plugins_mod
from tongflow.engine import runner as runner_mod
from tongflow.engine.abi_schema import load_abi_schema
from tongflow.engine.assets import (
    convert_asset_outputs_to_file_refs,
    materialize_asset_inputs,
)
from tongflow.engine.bindings import resolve_node_params
from tongflow.engine.invoker import parse_progress_line
from tongflow.engine.output_view import compute_output_view
from tongflow.engine.store import DiskStore, MemoryStore

# --- compute_output_view ----------------------------------------------------


def test_compute_output_view_scalar_and_asset():
    routes = [
        {"sourceField": "text", "nodeType": "textNode", "dataField": "texts"},
        {
            "sourceField": "image",
            "nodeType": "imageNode",
            "dataField": "fileKeys",
            "itemValuePath": "file_key",
        },
    ]
    payload = {"text": "hi", "image": {"file_key": "k.png"}}
    view = compute_output_view(routes, payload)
    assert view["text"]["values"] == ["hi"]
    assert view["image"]["values"] == ["k.png"]


def test_compute_output_view_array_and_array_of_arrays():
    routes = [
        {"sourceField": "images", "dataField": "fileKeys", "itemValuePath": "file_key"},
        {
            "sourceField": "groups",
            "dataField": "fileKeys",
            "itemValuePath": "file_key",
            "isArrayOfArrays": True,
        },
    ]
    payload = {
        "images": [{"file_key": "a"}, {"file_key": "b"}],
        "groups": [[{"file_key": "c"}], [{"file_key": "d"}, {"file_key": "e"}]],
    }
    view = compute_output_view(routes, payload)
    assert view["images"]["values"] == ["a", "b"]
    assert view["groups"]["values"] == ["c", "d", "e"]


# --- resolve_node_params ----------------------------------------------------


def test_resolve_node_params_handle_scalar_from_data_node():
    node = {
        "bindings": {
            "text": {
                "kind": "handle",
                "consumerShape": "scalar",
                "sources": [{"fromNodeId": "dn1", "fromField": "texts"}],
            }
        }
    }
    state = {"dn1": {"texts": ["first", "second"]}}
    params = resolve_node_params(node, {}, state, [{"id": "dn1"}], {})
    assert params["text"] == "first"


def test_resolve_node_params_array_and_config_and_input():
    node = {
        "bindings": {
            "texts": {
                "kind": "handle",
                "consumerShape": "array",
                "sources": [
                    {"fromNodeId": "u1", "fromField": "text"},
                    {"fromNodeId": "dn1", "fromField": "texts"},
                ],
            },
            "width": {"kind": "config", "value": 1024},
            "seed": {"kind": "input", "inputName": "the_seed"},
        }
    }
    views = {"u1": {"text": {"values": ["from-upstream"]}}}
    state = {"dn1": {"texts": ["x", "y"]}}
    params = resolve_node_params(
        node, views, state, [{"id": "dn1"}], {"the_seed": 7}
    )
    assert params["texts"] == ["from-upstream", "x", "y"]
    assert params["width"] == 1024
    assert params["seed"] == 7


def test_resolve_node_params_workflow_input_fallback():
    node = {
        "bindings": {
            "text": {
                "kind": "handle",
                "consumerShape": "scalar",
                "sources": [{"fromNodeId": "dn1", "fromField": "texts"}],
            }
        }
    }
    data_nodes = [{"id": "dn1", "inputName": "in_a"}]
    params = resolve_node_params(
        node, {}, {}, data_nodes, {"in_a": {"texts": ["overridden"]}}
    )
    assert params["text"] == "overridden"


# --- asset materialization --------------------------------------------------

_ABI = {
    "version": 1,
    "$defs": {
        "Asset": {"type": "object", "properties": {"bytesBase64": {"type": "string"}}},
        "ImageRef": {"type": "object", "properties": {"file_key": {"type": "string"}}},
    },
    "nodes": [
        {
            "nodeSlot": "gen-text",
            "inputs": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
            },
            "outputs": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
            },
        },
        {
            "nodeSlot": "image-edit",
            "inputs": {
                "type": "object",
                "properties": {"image": {"$ref": "#/$defs/Asset"}},
            },
            "outputs": {
                "type": "object",
                "properties": {"image": {"$ref": "#/$defs/ImageRef"}},
            },
        },
        {
            "nodeSlot": "make-image",
            "inputs": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
            },
            "outputs": {
                "type": "object",
                "properties": {"image": {"$ref": "#/$defs/ImageRef"}},
            },
        },
    ],
}


def _write_abi(tmp_path: Path) -> Path:
    p = tmp_path / "abi.json"
    p.write_text(json.dumps(_ABI), encoding="utf-8")
    return p


def test_materialize_asset_inputs_from_file(tmp_path):
    abi = load_abi_schema(_write_abi(tmp_path))
    src = tmp_path / "pic.png"
    src.write_bytes(b"\x89PNG-data")
    out = materialize_asset_inputs(
        "image-edit", {"image": str(src)}, abi, [tmp_path], MemoryStore()
    )
    assert base64.b64decode(out["image"]["bytesBase64"]) == b"\x89PNG-data"
    assert out["image"]["mime"] == "image/png"


def test_materialize_asset_inputs_from_mem_handle(tmp_path):
    abi = load_abi_schema(_write_abi(tmp_path))
    store = MemoryStore()
    ref = store.put(b"BYTES", mime="image/png")  # {file_key: "mem://..."}
    out = materialize_asset_inputs(
        "image-edit", {"image": ref["file_key"]}, abi, [tmp_path], store
    )
    assert base64.b64decode(out["image"]["bytesBase64"]) == b"BYTES"


def test_materialize_asset_inputs_data_url_and_passthrough(tmp_path):
    abi = load_abi_schema(_write_abi(tmp_path))
    b64 = base64.b64encode(b"abc").decode()
    out = materialize_asset_inputs(
        "image-edit",
        {"image": f"data:image/png;base64,{b64}"},
        abi,
        [tmp_path],
        MemoryStore(),
    )
    assert out["image"]["bytesBase64"] == b64
    # already-Asset passes through unchanged
    existing = {"bytesBase64": b64, "mime": "image/png"}
    out2 = materialize_asset_inputs(
        "image-edit", {"image": existing}, abi, [tmp_path], MemoryStore()
    )
    assert out2["image"] is existing


def test_convert_asset_outputs_disk_store(tmp_path):
    abi = load_abi_schema(_write_abi(tmp_path))
    out_dir = tmp_path / "out"
    b64 = base64.b64encode(b"IMG").decode()
    raw = {"success": True, "image": {"bytesBase64": b64, "mime": "image/png"}}
    result = convert_asset_outputs_to_file_refs(
        "image-edit", raw, abi, DiskStore(out_dir)
    )
    fk = result["image"]["file_key"]
    assert Path(fk).is_file()
    assert Path(fk).read_bytes() == b"IMG"


def test_convert_asset_outputs_relative_file_key(tmp_path):
    abi = load_abi_schema(_write_abi(tmp_path))
    base = tmp_path / "uploads"
    out_dir = base / "tasks" / "t1"
    b64 = base64.b64encode(b"IMG").decode()
    raw = {"success": True, "image": {"bytesBase64": b64}}
    result = convert_asset_outputs_to_file_refs(
        "image-edit", raw, abi, DiskStore(out_dir, file_key_base=base)
    )
    fk = result["image"]["file_key"]
    # relative to base, forward slashes, and resolvable back under base
    assert fk.startswith("tasks/t1/")
    assert (base / fk).read_bytes() == b"IMG"


def test_convert_asset_outputs_memory_store_no_disk(tmp_path):
    abi = load_abi_schema(_write_abi(tmp_path))
    store = MemoryStore()
    b64 = base64.b64encode(b"IMG").decode()
    raw = {"success": True, "image": {"bytesBase64": b64}}
    result = convert_asset_outputs_to_file_refs("image-edit", raw, abi, store)
    fk = result["image"]["file_key"]
    assert fk.startswith("mem://")
    assert store.get(fk) == b"IMG"
    # nothing written to disk
    assert list(tmp_path.iterdir()) == [tmp_path / "abi.json"]


def test_convert_asset_outputs_passthrough_file_key(tmp_path):
    abi = load_abi_schema(_write_abi(tmp_path))
    raw = {"success": True, "image": {"file_key": "already.png", "mime": "image/png"}}
    result = convert_asset_outputs_to_file_refs(
        "image-edit", raw, abi, MemoryStore()
    )
    assert result["image"] == {"file_key": "already.png", "mime": "image/png"}


# --- progress parsing -------------------------------------------------------


def test_parse_progress_line():
    from tongflow.progress import PROGRESS_SENTINEL

    line = PROGRESS_SENTINEL + json.dumps({"message": "hi", "percent": 42})
    assert parse_progress_line(line) == {"message": "hi", "percent": 42}
    assert parse_progress_line("ordinary log") is None
    assert parse_progress_line(PROGRESS_SENTINEL + "{}") is None


# --- end-to-end -------------------------------------------------------------

_STUB_ENTRY = """\
import json, sys
payload = json.loads(sys.stdin.read())
text = payload["prompt"].get("text", "")
print(json.dumps({"success": True, "text": text.upper()}))
"""


def test_run_workflow_end_to_end(tmp_path, monkeypatch):
    abi_path = _write_abi(tmp_path)
    plugins_dir = tmp_path / "plugins"
    plugin_id = "tongflow-api-echo"
    pdir = plugins_dir / plugin_id
    pdir.mkdir(parents=True)
    (pdir / "entry.py").write_text(_STUB_ENTRY, encoding="utf-8")

    # Stub the scan so the test focuses on engine orchestration (scan has its
    # own coverage and would require fully-annotated @node_slot methods).
    monkeypatch.setattr(
        runner_mod,
        "scan_manifest",
        lambda _pd, _abi: {
            "plugins": {
                plugin_id: {
                    "localSubdir": plugin_id,
                    "entryFile": "entry.py",
                    "methodsByNodeSlot": {"gen-text": {"methodName": "gen_text"}},
                    "needsDeploy": False,
                }
            }
        },
    )

    exec_id = "exec-1"
    dn_id = "dn-1"
    workflow = {
        "name": "t",
        "version": "1.0",
        "inputs": [
            {"name": "in_text", "type": "text[]", "required": False, "nodeId": dn_id}
        ],
        "outputs": [{"name": "out_text", "nodeId": exec_id, "field": "text"}],
        "dataNodes": [
            {
                "id": dn_id,
                "type": "addTextNode",
                "dataType": "text",
                "isInput": True,
                "inputName": "in_text",
                "staticData": {"texts": ["hello"]},
                "level": 0,
            }
        ],
        "executableNodes": [
            {
                "id": exec_id,
                "type": "textNode",
                "feature": "gen-text",
                "pluginId": plugin_id,
                "bindings": {
                    "text": {
                        "kind": "handle",
                        "consumerShape": "scalar",
                        "sources": [{"fromNodeId": dn_id, "fromField": "texts"}],
                        "targetHandle": "in:text",
                    }
                },
                "outputs": [
                    {
                        "sourceField": "text",
                        "nodeType": "textNode",
                        "dataField": "texts",
                        "expandEach": False,
                    }
                ],
                "dependencies": [dn_id],
                "level": 1,
            }
        ],
        "executionLevels": [[dn_id], [exec_id]],
        "dataNodeEdges": [],
    }

    events = []
    result = run_workflow(
        workflow,
        plugins_dir=plugins_dir,
        data_dir=tmp_path / "data",
        abi_path=abi_path,
        auto_install=False,
        on_progress=events.append,
    )

    assert result["status"] == "success"
    assert result["outputs"][exec_id]["text"] == "HELLO"
    assert result["outputs_by_name"]["out_text"] == ["HELLO"]
    assert any(e["type"] == "node_completed" for e in events)


def _stub_plugin_and_workflow(tmp_path):
    plugins_dir = tmp_path / "plugins"
    plugin_id = "tongflow-api-echo"
    pdir = plugins_dir / plugin_id
    pdir.mkdir(parents=True)
    (pdir / "entry.py").write_text(_STUB_ENTRY, encoding="utf-8")
    exec_id, dn_id = "exec-1", "dn-1"
    workflow = {
        "name": "t",
        "version": "1.0",
        "inputs": [],
        "outputs": [{"name": "out_text", "nodeId": exec_id, "field": "text"}],
        "dataNodes": [
            {
                "id": dn_id,
                "type": "addTextNode",
                "dataType": "text",
                "isInput": True,
                "inputName": "in_text",
                "staticData": {"texts": ["hello"]},
                "level": 0,
            }
        ],
        "executableNodes": [
            {
                "id": exec_id,
                "type": "textNode",
                "feature": "gen-text",
                "pluginId": plugin_id,
                "bindings": {
                    "text": {
                        "kind": "handle",
                        "consumerShape": "scalar",
                        "sources": [{"fromNodeId": dn_id, "fromField": "texts"}],
                        "targetHandle": "in:text",
                    }
                },
                "outputs": [
                    {"sourceField": "text", "nodeType": "textNode", "dataField": "texts", "expandEach": False}
                ],
                "dependencies": [dn_id],
                "level": 1,
            }
        ],
        "executionLevels": [[dn_id], [exec_id]],
        "dataNodeEdges": [],
    }
    return plugins_dir, plugin_id, workflow, exec_id


def _patch_scan(monkeypatch, plugin_id):
    monkeypatch.setattr(
        runner_mod,
        "scan_manifest",
        lambda _pd, _abi: {
            "plugins": {
                plugin_id: {
                    "localSubdir": plugin_id,
                    "entryFile": "entry.py",
                    "methodsByNodeSlot": {"gen-text": {"methodName": "gen_text"}},
                    "needsDeploy": False,
                }
            }
        },
    )


def test_ndjson_main_streams_events_and_result(tmp_path, monkeypatch, capsys):
    import io

    from tongflow.engine.__main__ import main

    plugins_dir, plugin_id, workflow, exec_id = _stub_plugin_and_workflow(tmp_path)
    _patch_scan(monkeypatch, plugin_id)

    req = {
        "workflow": workflow,
        "inputs": {},
        "options": {
            "plugins_dir": str(plugins_dir),
            "data_dir": str(tmp_path / "data"),
            "abi_path": str(_write_abi(tmp_path)),
            "auto_install": False,
        },
    }
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(req)))
    code = main()
    assert code == 0

    lines = [json.loads(x) for x in capsys.readouterr().out.splitlines() if x.strip()]
    assert any(l.get("event", {}).get("type") == "node_completed" for l in lines)
    result_lines = [l["result"] for l in lines if "result" in l]
    assert len(result_lines) == 1
    assert result_lines[0]["status"] == "success"
    assert result_lines[0]["outputs"][exec_id]["text"] == "HELLO"


def test_run_workflow_uses_static_data_when_input_omitted(tmp_path, monkeypatch):
    # Same as above but verifies a workflow-level input overrides staticData.
    abi_path = _write_abi(tmp_path)
    plugins_dir = tmp_path / "plugins"
    plugin_id = "tongflow-api-echo"
    pdir = plugins_dir / plugin_id
    pdir.mkdir(parents=True)
    (pdir / "entry.py").write_text(_STUB_ENTRY, encoding="utf-8")
    monkeypatch.setattr(
        runner_mod,
        "scan_manifest",
        lambda _pd, _abi: {
            "plugins": {
                plugin_id: {
                    "localSubdir": plugin_id,
                    "entryFile": "entry.py",
                    "methodsByNodeSlot": {"gen-text": {"methodName": "gen_text"}},
                    "needsDeploy": False,
                }
            }
        },
    )
    exec_id, dn_id = "exec-1", "dn-1"
    workflow = {
        "name": "t",
        "version": "1.0",
        "inputs": [],
        "outputs": [],
        "dataNodes": [
            {
                "id": dn_id,
                "type": "addTextNode",
                "dataType": "text",
                "isInput": True,
                "inputName": "in_text",
                "staticData": {"texts": ["fromstatic"]},
                "level": 0,
            }
        ],
        "executableNodes": [
            {
                "id": exec_id,
                "type": "textNode",
                "feature": "gen-text",
                "pluginId": plugin_id,
                "bindings": {
                    "text": {
                        "kind": "handle",
                        "consumerShape": "scalar",
                        "sources": [{"fromNodeId": dn_id, "fromField": "texts"}],
                        "targetHandle": "in:text",
                    }
                },
                "outputs": [
                    {"sourceField": "text", "nodeType": "textNode", "dataField": "texts", "expandEach": False}
                ],
                "dependencies": [dn_id],
                "level": 1,
            }
        ],
        "executionLevels": [[dn_id], [exec_id]],
        "dataNodeEdges": [],
    }

    # override via inputs
    result = run_workflow(
        workflow,
        inputs={"in_text": {"texts": ["override"]}},
        plugins_dir=plugins_dir,
        data_dir=tmp_path / "data",
        abi_path=abi_path,
        auto_install=False,
    )
    assert result["outputs"][exec_id]["text"] == "OVERRIDE"


# --- paths resolution -------------------------------------------------------


def test_paths_default_user_level(monkeypatch, tmp_path):
    import sys as _sys

    from tongflow.engine import paths

    monkeypatch.delenv("TONGFLOW_DATA_DIR", raising=False)
    monkeypatch.delenv("TONGFLOW_PLUGINS_DIR", raising=False)
    monkeypatch.setattr(_sys, "platform", "darwin")
    monkeypatch.setenv("HOME", str(tmp_path))

    data = paths.resolve_data_dir()
    plugins = paths.resolve_plugins_dir()
    base = tmp_path / "Library" / "Application Support" / "TongFlow"
    assert data == (base / "data").resolve()
    assert plugins == (base / "plugins").resolve()
    # never the cwd
    assert Path.cwd() not in data.parents


def test_paths_env_override(monkeypatch, tmp_path):
    from tongflow.engine import paths

    monkeypatch.setenv("TONGFLOW_DATA_DIR", str(tmp_path / "d"))
    monkeypatch.setenv("TONGFLOW_PLUGINS_DIR", str(tmp_path / "p"))
    assert paths.resolve_data_dir() == (tmp_path / "d").resolve()
    assert paths.resolve_plugins_dir() == (tmp_path / "p").resolve()


# --- venv SDK install source (PyPI) -----------------------------------------


def test_shared_venv_installs_sdk_from_pypi(monkeypatch, tmp_path):
    import tongflow

    calls = []

    def fake_run(cmd, cwd):
        calls.append(list(cmd))
        return 0, ""

    monkeypatch.setattr(plugins_mod, "_run", fake_run)
    # Force the install path (no pre-existing venv python).
    monkeypatch.setattr(plugins_mod, "_venv_python", lambda d: tmp_path / "nope")

    plugins_mod._ensure_shared_venv(tmp_path / "data", lambda _m: None)

    pip_installs = [c for c in calls if "install" in c]
    assert any(f"tongflow=={tongflow.__version__}" in c for c in pip_installs)
    # never installs from a local path
    assert not any("--upgrade" in c for c in pip_installs)


# --- inline (zero-disk) end-to-end + mem:// chaining ------------------------

_IMG_STUB_ENTRY = """\
import base64, json, sys
p = json.loads(sys.stdin.read())
slot = p["nodeSlot"]
prompt = p["prompt"]
if slot == "make-image":
    data = b"IMG-" + prompt.get("text", "").encode()
    print(json.dumps({"success": True, "image": {
        "bytesBase64": base64.b64encode(data).decode(), "mime": "image/png"}}))
elif slot == "image-edit":
    img = prompt.get("image") or {}
    raw = base64.b64decode(img.get("bytesBase64", ""))
    out = b"EDITED-" + raw
    print(json.dumps({"success": True, "image": {
        "bytesBase64": base64.b64encode(out).decode(), "mime": "image/png"}}))
"""


def test_run_workflow_inline_zero_disk_and_mem_chain(tmp_path, monkeypatch):
    abi_path = _write_abi(tmp_path)
    plugins_dir = tmp_path / "plugins"
    plugin_id = "tongflow-api-img"
    pdir = plugins_dir / plugin_id
    pdir.mkdir(parents=True)
    (pdir / "entry.py").write_text(_IMG_STUB_ENTRY, encoding="utf-8")

    monkeypatch.setattr(
        runner_mod,
        "scan_manifest",
        lambda _pd, _abi: {
            "plugins": {
                plugin_id: {
                    "localSubdir": plugin_id,
                    "entryFile": "entry.py",
                    "methodsByNodeSlot": {
                        "make-image": {"methodName": "make_image"},
                        "image-edit": {"methodName": "image_edit"},
                    },
                    "needsDeploy": False,
                }
            }
        },
    )

    dn_id, n1, n2 = "dn-1", "n1", "n2"
    workflow = {
        "name": "img",
        "version": "1.0",
        "inputs": [],
        "outputs": [{"name": "out_img", "nodeId": n2, "field": "image"}],
        "dataNodes": [
            {
                "id": dn_id,
                "type": "addTextNode",
                "dataType": "text",
                "isInput": True,
                "inputName": "in_text",
                "staticData": {"texts": ["cat"]},
                "level": 0,
            }
        ],
        "executableNodes": [
            {
                "id": n1,
                "type": "imageNode",
                "feature": "make-image",
                "pluginId": plugin_id,
                "bindings": {
                    "text": {
                        "kind": "handle",
                        "consumerShape": "scalar",
                        "sources": [{"fromNodeId": dn_id, "fromField": "texts"}],
                        "targetHandle": "in:text",
                    }
                },
                "outputs": [
                    {"sourceField": "image", "nodeType": "imageNode",
                     "dataField": "fileKeys", "expandEach": False,
                     "itemValuePath": "file_key"}
                ],
                "dependencies": [dn_id],
                "level": 1,
            },
            {
                "id": n2,
                "type": "imageNode",
                "feature": "image-edit",
                "pluginId": plugin_id,
                "bindings": {
                    "image": {
                        "kind": "handle",
                        "consumerShape": "scalar",
                        "sources": [{"fromNodeId": n1, "fromField": "image"}],
                        "targetHandle": "in:image",
                    }
                },
                "outputs": [
                    {"sourceField": "image", "nodeType": "imageNode",
                     "dataField": "fileKeys", "expandEach": False,
                     "itemValuePath": "file_key"}
                ],
                "dependencies": [n1],
                "level": 2,
            },
        ],
        "executionLevels": [[dn_id], [n1], [n2]],
        "dataNodeEdges": [],
    }

    # Run from a clean cwd to assert non-invasiveness.
    monkeypatch.chdir(tmp_path)
    data_dir = tmp_path / "data"
    result = run_workflow(
        workflow,
        plugins_dir=plugins_dir,
        data_dir=data_dir,
        abi_path=abi_path,
        auto_install=False,
        inline_outputs=True,  # default, explicit for clarity
    )

    assert result["status"] == "success"
    # Final output inlined as bytes: EDITED-(IMG-cat), no file_key path.
    img = result["outputs"][n2]["image"]
    assert "bytesBase64" in img and "file_key" not in img
    assert base64.b64decode(img["bytesBase64"]) == b"EDITED-IMG-cat"
    assert base64.b64decode(result["outputs_by_name"]["out_img"][0]) == b"EDITED-IMG-cat"
    # Zero binary output files on disk: no engine-out dir created.
    assert not (data_dir / "engine-out").exists()


def test_run_workflow_disk_mode_writes_files(tmp_path, monkeypatch):
    abi_path = _write_abi(tmp_path)
    plugins_dir = tmp_path / "plugins"
    plugin_id = "tongflow-api-img"
    pdir = plugins_dir / plugin_id
    pdir.mkdir(parents=True)
    (pdir / "entry.py").write_text(_IMG_STUB_ENTRY, encoding="utf-8")
    monkeypatch.setattr(
        runner_mod,
        "scan_manifest",
        lambda _pd, _abi: {
            "plugins": {
                plugin_id: {
                    "localSubdir": plugin_id,
                    "entryFile": "entry.py",
                    "methodsByNodeSlot": {"make-image": {"methodName": "m"}},
                    "needsDeploy": False,
                }
            }
        },
    )
    dn_id, n1 = "dn-1", "n1"
    workflow = {
        "name": "img", "version": "1.0", "inputs": [],
        "outputs": [{"name": "out_img", "nodeId": n1, "field": "image"}],
        "dataNodes": [{"id": dn_id, "type": "addTextNode", "dataType": "text",
                       "isInput": True, "inputName": "in_text",
                       "staticData": {"texts": ["cat"]}, "level": 0}],
        "executableNodes": [{
            "id": n1, "type": "imageNode", "feature": "make-image",
            "pluginId": plugin_id,
            "bindings": {"text": {"kind": "handle", "consumerShape": "scalar",
                "sources": [{"fromNodeId": dn_id, "fromField": "texts"}],
                "targetHandle": "in:text"}},
            "outputs": [{"sourceField": "image", "nodeType": "imageNode",
                "dataField": "fileKeys", "expandEach": False,
                "itemValuePath": "file_key"}],
            "dependencies": [dn_id], "level": 1,
        }],
        "executionLevels": [[dn_id], [n1]],
        "dataNodeEdges": [],
    }
    out_dir = tmp_path / "uploads" / "tasks" / "t1"
    result = run_workflow(
        workflow, plugins_dir=plugins_dir, data_dir=tmp_path / "data",
        abi_path=abi_path, auto_install=False, inline_outputs=False,
        out_dir=out_dir, file_key_base=tmp_path / "uploads",
    )
    assert result["status"] == "success"
    fk = result["outputs"][n1]["image"]["file_key"]
    assert fk.startswith("tasks/t1/")  # relative to file_key_base
    assert (tmp_path / "uploads" / fk).read_bytes() == b"IMG-cat"
