"""Standalone workflow execution engine.

``run_workflow`` interprets an exported ``ExecutableWorkflow`` JSON
(``src/lib/workflow/exporter.ts`` output) entirely in Python — no running
TongFlow app required. It is a direct translation of ``executeWorkflowTask`` in
``src/lib/task/runner.ts``:

1. seed data-node state from ``staticData`` (workflow inputs override on read)
2. for each tier in ``executionLevels`` (already topologically sorted):
   resolve params from bindings (fanning out over the node's ``batchField``
   when it collected multiple upstream values — one plugin invocation per
   value, outputs concatenated in batch order) -> materialize asset inputs ->
   spawn the plugin -> persist asset outputs -> project into the ABI output
   view -> refresh the downstream data nodes this node feeds
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
from .bindings import resolve_node_param_sets
from .invoker import invoke_plugin
from .output_view import compute_output_view
from .paths import resolve_data_dir, resolve_plugins_dir
from .plugins import (
    DEFAULT_ORG,
    SDK_ROOT,
    browser_runtime_error,
    collect_plugin_ids,
    ensure_plugins_present,
    is_browser_plugin,
    prepare_python_env,
    scan_manifest,
)
from .store import AssetStore, DiskStore, HttpStore, MemoryStore

EventCb = Callable[[dict[str, Any]], None]

# Optional backend-specific plugin invoker. When supplied, run_workflow calls
# this instead of spawning the plugin's entry.py — a cloud orchestrator can
# dispatch straight to the plugin's own deployed function, skipping the shared
# venv and the subprocess entirely. Backend-neutral here: the host owns the
# call. Signature: (plugin_id, node_slot, prompt, plugin_dir, model) -> raw ABI dict.
InvokerCb = Callable[[str, str, dict[str, Any], Path, Optional[str]], dict[str, Any]]


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


def _merge_batch_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge per-item outputs of a batch fan-out into one payload.

    Each business field becomes the concatenation of the per-item values in
    batch order (per-item lists are extended, scalars appended), so
    ``compute_output_view`` sees one flat channel and downstream nodes read
    all items. ``success`` / ``error`` meta fields are dropped — the runner
    already raised on any per-item failure.
    """
    merged: dict[str, Any] = {"success": True}
    for r in results:
        for k, v in r.items():
            if k in ("success", "error") or v is None:
                continue
            bucket = merged.setdefault(k, [])
            if isinstance(v, list):
                bucket.extend(v)
            else:
                bucket.append(v)
    return merged


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
    asset_endpoint: Optional[str] = None,
    asset_token: Optional[str] = None,
    auto_install: bool = True,
    org: str = DEFAULT_ORG,
    plugin_git_urls: Optional[dict[str, str]] = None,
    on_progress: Optional[EventCb] = None,
    task_id: str = "tongflow-engine",
    invoker: Optional[InvokerCb] = None,
    env: Optional[dict[str, str]] = None,
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
        asset_endpoint / asset_token: host-managed asset store (loopback HTTP
            sink, see :class:`~tongflow.engine.store.HttpStore`). When set it
            overrides ``inline_outputs``: outputs are POSTed to the host and
            input ``file_key`` refs are fetched from it — the engine touches
            no asset files on disk.
        auto_install: clone missing plugins and provision a shared venv.
        org / plugin_git_urls: where to clone official / custom plugins from.
        on_progress: optional callback receiving progress event dicts.
        env: extra environment variables for every plugin subprocess (API
            keys, proxies, ...). Merged over the inherited environment; a
            host embedding the engine passes its stored settings here.

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
    store: AssetStore
    if asset_endpoint:
        store = HttpStore(asset_endpoint, asset_token)
    elif inline_outputs:
        store = MemoryStore()
    else:
        store = DiskStore(out_path, fk_base)

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
    # A host-supplied invoker dispatches to the plugin's own deployed function,
    # so there is no subprocess to host and no shared venv to provision.
    python = (
        ""
        if invoker is not None
        else prepare_python_env(
            plugin_ids, plugins_dir, data_dir, auto_install=auto_install, log=log
        )
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
            model = (node.get("model") or "").strip() or None
            raw_params = node.get("params")
            params = raw_params if isinstance(raw_params, dict) and raw_params else None
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
                if is_browser_plugin(plugin_id, cfg):
                    raise RuntimeError(browser_runtime_error(plugin_id, slot))
                if not cfg:
                    raise RuntimeError(
                        f"Plugin {plugin_id} not found in scanned manifest."
                    )

                param_sets = resolve_node_param_sets(
                    node, output_views, data_node_state, data_nodes, inputs
                )
                plugin_dir = plugins_dir / cfg["localSubdir"]
                total = len(param_sets)
                item_results: list[dict[str, Any]] = []
                # `item_params` is one fan-out's business input; `params` stays the
                # node's advanced params (the `_params` reserved key).
                for item_idx, item_params in enumerate(param_sets):
                    if total > 1:
                        emit(
                            {
                                "type": "plugin_progress",
                                "nodeId": node_id,
                                "message": f"batch {item_idx + 1}/{total}",
                            }
                        )
                    business_input = materialize_asset_inputs(
                        slot, item_params, abi, search_dirs, store
                    )
                    if invoker is not None:
                        # Host-owned invoker has a fixed signature; hand it the
                        # advanced params inside the prompt under the reserved
                        # key, exactly as invoke_plugin does for entry.py.
                        raw = invoker(
                            plugin_id,
                            slot,
                            {**business_input, "_params": params}
                            if params
                            else business_input,
                            plugin_dir,
                            model,
                        )
                    else:
                        raw = invoke_plugin(
                            python=python,
                            plugin_dir=plugin_dir,
                            entry_file=cfg.get("entryFile", "entry.py"),
                            plugin_id=plugin_id,
                            node_slot=slot,
                            prompt=business_input,
                            sdk_root=SDK_ROOT,
                            task_id=task_id,
                            model=model,
                            params=params,
                            on_progress=on_progress,
                            env_extra=env,
                        )
                    item = convert_asset_outputs_to_file_refs(
                        slot, raw, abi, store
                    )

                    if item.get("success") is False:
                        suffix = (
                            f" (batch item {item_idx + 1}/{total})"
                            if total > 1
                            else ""
                        )
                        raise RuntimeError(
                            str(item.get("error") or "Plugin returned success=false")
                            + suffix
                        )
                    item_results.append(item)

                result = (
                    item_results[0]
                    if total == 1
                    else _merge_batch_results(item_results)
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
