"""Standalone workflow execution engine.

``run_workflow`` interprets an exported ``ExecutableWorkflow`` JSON
(``src/lib/workflow/exporter.ts`` output) entirely in Python — no running
TongFlow app required. It is a direct translation of ``executeWorkflowTask`` in
``src/lib/task/runner.ts``:

1. seed data-node state from ``staticData`` (workflow inputs override on read)
2. for each tier in ``executionLevels`` (already topologically sorted):
   resolve params from bindings -> materialize asset inputs -> spawn the plugin
   -> persist asset outputs -> project into the ABI output view -> refresh the
   downstream data nodes this node feeds
3. aggregate per-node outputs / errors and return.

The exported JSON is a self-contained execution plan (sorted levels, resolved
bindings, resolved output routes), so no graph parsing happens here.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any, Callable, Optional, Union

from .abi_schema import load_abi_schema, resolve_abi_path
from .assets import convert_asset_outputs_to_file_refs, materialize_asset_inputs
from .bindings import resolve_node_params
from .invoker import invoke_plugin
from .output_view import compute_output_view
from .paths import resolve_data_dir, resolve_plugins_dir
from .plugins import (
    DEFAULT_ORG,
    SDK_ROOT,
    collect_plugin_ids,
    ensure_plugins_present,
    prepare_python_env,
    scan_manifest,
)
from .store import AssetStore, DiskStore, MemoryStore

EventCb = Callable[[dict[str, Any]], None]


def _inline_outputs_in_obj(obj: Any, store: MemoryStore) -> Any:
    """Recursively replace ``{file_key: mem://...}`` refs with inline bytes.

    Used in inline mode so the caller receives ``{bytesBase64, mime?, filename?}``
    instead of opaque in-memory handles.
    """
    if isinstance(obj, dict):
        fk = obj.get("file_key")
        if isinstance(fk, str) and fk.startswith(MemoryStore.SCHEME):
            data = store.get(fk)
            if data is not None:
                out: dict[str, Any] = {
                    "bytesBase64": base64.b64encode(data).decode("ascii")
                }
                if isinstance(obj.get("mime"), str):
                    out["mime"] = obj["mime"]
                if isinstance(obj.get("filename"), str):
                    out["filename"] = obj["filename"]
                return out
        return {k: _inline_outputs_in_obj(v, store) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_inline_outputs_in_obj(v, store) for v in obj]
    if isinstance(obj, str) and obj.startswith(MemoryStore.SCHEME):
        data = store.get(obj)
        if data is not None:
            return base64.b64encode(data).decode("ascii")
    return obj


def _load_workflow(workflow: Union[str, Path, dict[str, Any]]) -> dict[str, Any]:
    if isinstance(workflow, dict):
        return workflow
    return json.loads(Path(workflow).read_text(encoding="utf-8"))


def _input_to_slot(value: Any, data_type: Any) -> dict[str, Any]:
    """Normalize a provided workflow input into a {texts|fileKeys} slot.

    A dict with ``texts`` / ``fileKeys`` is used as-is; a list or string is
    routed to ``texts`` for text data nodes and ``fileKeys`` otherwise.
    """
    if isinstance(value, dict):
        slot: dict[str, Any] = {}
        if value.get("texts"):
            slot["texts"] = list(value["texts"])
        if value.get("fileKeys"):
            slot["fileKeys"] = list(value["fileKeys"])
        return slot
    field = "texts" if data_type == "text" else "fileKeys"
    if isinstance(value, list):
        return {field: [str(v) for v in value]}
    if isinstance(value, str):
        return {field: [value]}
    return {}


def _seed_data_node_state(
    data_nodes: list[dict[str, Any]], inputs: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    """Seed live data-node state.

    Each input data node uses a caller-provided value for its ``inputName`` when
    present (the execution-engine contract: provided inputs override the canvas
    defaults), otherwise it falls back to the baked-in ``staticData``.
    """
    state: dict[str, dict[str, Any]] = {}
    for dn in data_nodes:
        if not isinstance(dn, dict):
            continue
        slot: dict[str, Any] = {}
        input_name = dn.get("inputName")
        if input_name and input_name in inputs:
            slot = _input_to_slot(inputs[input_name], dn.get("dataType"))
        if not slot:
            static = dn.get("staticData")
            if isinstance(static, dict):
                if static.get("texts"):
                    slot["texts"] = static["texts"]
                if static.get("fileKeys"):
                    slot["fileKeys"] = static["fileKeys"]
        if slot:
            state[dn["id"]] = slot
    return state


def _map_workflow_outputs(
    workflow: dict[str, Any],
    output_views: dict[str, dict[str, Any]],
    data_node_state: dict[str, dict[str, Any]],
) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for spec in workflow.get("outputs", []):
        if not isinstance(spec, dict):
            continue
        name = spec.get("name")
        node_id = spec.get("nodeId")
        field = spec.get("field")
        if not (isinstance(name, str) and isinstance(node_id, str) and isinstance(field, str)):
            continue
        view = output_views.get(node_id)
        if view and field in view:
            out[name] = list(view[field]["values"])
            continue
        slot = data_node_state.get(node_id)
        if slot:
            if field in ("texts", "fileKeys") and slot.get(field):
                out[name] = list(slot[field])
            elif slot.get("fileKeys"):
                out[name] = list(slot["fileKeys"])
            elif slot.get("texts"):
                out[name] = list(slot["texts"])
    return out


def run_workflow(
    workflow: Union[str, Path, dict[str, Any]],
    inputs: Optional[dict[str, Any]] = None,
    *,
    plugins_dir: Optional[Union[str, Path]] = None,
    data_dir: Optional[Union[str, Path]] = None,
    out_dir: Optional[Union[str, Path]] = None,
    abi_path: Optional[Union[str, Path]] = None,
    file_key_base: Optional[Union[str, Path]] = None,
    inline_outputs: bool = True,
    auto_install: bool = True,
    org: str = DEFAULT_ORG,
    plugin_git_urls: Optional[dict[str, str]] = None,
    on_progress: Optional[EventCb] = None,
    task_id: str = "tongflow-engine",
) -> dict[str, Any]:
    """Execute an exported workflow and return its results.

    Args:
        workflow: path to (or parsed dict of) an exported workflow JSON. The
            ``.executable.json`` form is ideal; ``.workflow.json`` works too
            (``originalFlow`` is ignored).
        inputs: workflow inputs keyed by ``WorkflowInput.name``. Each value may
            be ``{"texts"|"fileKeys": [...]}``, a list, or a string. Omitted
            inputs fall back to the data node's ``staticData``.
        plugins_dir / data_dir: filesystem roots. Defaults follow the desktop
            app's per-user dir (e.g. macOS ``~/Library/Application Support/
            TongFlow``), with env ``TONGFLOW_PLUGINS_DIR`` / ``TONGFLOW_DATA_DIR``
            honored. Never defaults to cwd.
        out_dir / file_key_base: only used when ``inline_outputs=False``.
        abi_path: ABI location (defaults to bundled / repo ``config``).
        inline_outputs: when True (default) outputs stay in memory and are
            returned as ``{bytesBase64, mime?, filename?}`` — zero files written
            (besides the required plugin clone / venv). When False, outputs are
            written to ``out_dir`` and returned as ``file_key`` paths.
        auto_install: clone missing plugins and provision a shared venv.
        org / plugin_git_urls: where to clone official / custom plugins from.
        on_progress: optional callback receiving progress event dicts.

    Returns:
        ``{"status", "outputs", "outputs_by_name", "errors", "failures"}``.
        ``outputs`` maps node id -> raw plugin output; in inline mode asset
        fields are ``{bytesBase64, ...}``, otherwise ``file_key`` paths.
    """
    inputs = inputs or {}
    wf = _load_workflow(workflow)

    plugins_dir = resolve_plugins_dir(plugins_dir)
    data_dir = resolve_data_dir(data_dir)
    fk_base = Path(file_key_base).resolve() if file_key_base else None
    abi_file = resolve_abi_path(abi_path)
    abi = load_abi_schema(abi_file)

    # Output store: in-memory (inline, zero disk) or on-disk (file_key paths,
    # used by the desktop delegation so the canvas reads via /api/uploads).
    out_path = Path(out_dir).resolve() if out_dir else (data_dir / "engine-out")
    store: AssetStore = (
        MemoryStore() if inline_outputs else DiskStore(out_path, fk_base)
    )

    def emit(event: dict[str, Any]) -> None:
        if on_progress is not None:
            on_progress(event)

    def log(message: str) -> None:
        emit({"type": "log", "message": message})

    # --- preflight: plugins + python env + manifest -------------------------
    plugin_ids = collect_plugin_ids(wf)
    ensure_plugins_present(
        plugin_ids,
        plugins_dir,
        auto_install=auto_install,
        org=org,
        plugin_git_urls=plugin_git_urls,
        log=log,
    )
    python = prepare_python_env(
        plugin_ids, plugins_dir, data_dir, auto_install=auto_install, log=log
    )
    manifest = scan_manifest(plugins_dir, abi_file)
    plugin_cfgs: dict[str, Any] = manifest.get("plugins", {})

    # Asset inputs may reference files relative to these roots. When a
    # file_key_base is set (host-managed uploads), resolve relative keys there
    # first so `tasks/<id>/x.png` style keys load. (mem:// handles are resolved
    # by the store, ahead of the filesystem search.)
    search_dirs = [
        d for d in [fk_base, plugins_dir, data_dir, out_path, Path.cwd()] if d
    ]

    exec_nodes: list[dict[str, Any]] = wf.get("executableNodes", []) or []
    nodes_by_id = {n["id"]: n for n in exec_nodes}
    data_nodes: list[dict[str, Any]] = wf.get("dataNodes", []) or []
    execution_levels: list[list[str]] = wf.get("executionLevels", []) or []

    output_views: dict[str, dict[str, Any]] = {}
    data_node_state = _seed_data_node_state(data_nodes, inputs)
    node_outputs: dict[str, Any] = {}
    error_summaries: list[str] = []
    failures: list[dict[str, str]] = []

    emit(
        {
            "type": "workflow_started",
            "totalNodes": len(exec_nodes),
            "levels": len(execution_levels),
        }
    )

    for level_idx, level in enumerate(execution_levels):
        for node_id in level:
            node = nodes_by_id.get(node_id)
            if node is None:
                continue
            label = node.get("label") or node.get("feature") or ""
            slot = (node.get("feature") or "").strip()
            plugin_id = (node.get("pluginId") or "").strip()
            emit(
                {
                    "type": "node_started",
                    "nodeId": node_id,
                    "level": level_idx + 1,
                    "feature": slot,
                    "label": label,
                }
            )
            try:
                if not plugin_id:
                    raise RuntimeError(
                        f"Missing pluginId for nodeSlot={slot}. Select a plugin in the node UI."
                    )
                if not abi.has_slot(slot):
                    raise RuntimeError(
                        f"Invalid nodeSlot={slot}: not in ABI. Cannot execute workflow node."
                    )
                cfg = plugin_cfgs.get(plugin_id)
                if not cfg:
                    raise RuntimeError(
                        f"Plugin {plugin_id} not found in scanned manifest."
                    )

                params = resolve_node_params(
                    node, output_views, data_node_state, data_nodes, inputs
                )
                business_input = materialize_asset_inputs(
                    slot, params, abi, search_dirs, store
                )
                raw = invoke_plugin(
                    python=python,
                    plugin_dir=plugins_dir / cfg["localSubdir"],
                    entry_file=cfg.get("entryFile", "entry.py"),
                    plugin_id=plugin_id,
                    node_slot=slot,
                    prompt=business_input,
                    sdk_root=SDK_ROOT,
                    task_id=task_id,
                    on_progress=on_progress,
                )
                result = convert_asset_outputs_to_file_refs(slot, raw, abi, store)

                if result.get("success") is False:
                    raise RuntimeError(
                        str(result.get("error") or "Plugin returned success=false")
                    )

                node_outputs[node_id] = result

                routes = node.get("outputs") or []
                view = compute_output_view(routes, result)
                output_views[node_id] = view
                for route in routes:
                    target = route.get("downstreamDataNodeId")
                    if not target:
                        continue
                    channel = view.get(route.get("sourceField"))
                    if not channel:
                        continue
                    slot_state = data_node_state.get(target, {})
                    if route.get("dataField") == "texts":
                        slot_state["texts"] = channel["values"]
                    else:
                        slot_state["fileKeys"] = channel["values"]
                    data_node_state[target] = slot_state

                emit(
                    {
                        "type": "node_completed",
                        "nodeId": node_id,
                        "output": result,
                        "label": label,
                    }
                )
            except Exception as e:  # noqa: BLE001 - aggregate per-node failure
                msg = str(e)
                error_summaries.append(f"Node {node_id} failed: {msg}")
                failures.append({"nodeId": node_id, "summary": msg})
                emit(
                    {
                        "type": "node_failed",
                        "nodeId": node_id,
                        "error": msg,
                        "label": label,
                    }
                )
                break
        if error_summaries:
            break

    outputs_by_name = _map_workflow_outputs(wf, output_views, data_node_state)

    # In inline mode, resolve mem:// handles to inline bytes for the caller.
    if isinstance(store, MemoryStore):
        node_outputs = _inline_outputs_in_obj(node_outputs, store)
        outputs_by_name = _inline_outputs_in_obj(outputs_by_name, store)

    status = "success" if not error_summaries else "failed"
    emit(
        {
            "type": "workflow_completed" if status == "success" else "workflow_failed",
            "status": status,
            "outputs": node_outputs,
            "errors": error_summaries,
        }
    )

    return {
        "status": status,
        "outputs": node_outputs,
        "outputs_by_name": outputs_by_name,
        "errors": error_summaries,
        "failures": failures,
    }
