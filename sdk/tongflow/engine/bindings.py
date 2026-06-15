"""Resolve a node's ABI input params from its bindings table.

Direct translation of ``resolveNodeParams`` in ``src/lib/task/runner.ts``.
Values are read, in order, from: the upstream executable's projected output
view, the live data-node state (``texts`` / ``fileKeys``), then the
workflow-level inputs (for data nodes flagged as inputs).
"""

from __future__ import annotations

from typing import Any


def resolve_node_params(
    node: dict[str, Any],
    output_views: dict[str, dict[str, Any]],
    data_node_state: dict[str, dict[str, Any]],
    data_nodes: list[dict[str, Any]],
    inputs: dict[str, Any],
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    bindings = node.get("bindings")
    if not bindings:
        return params

    data_node_map = {d["id"]: d for d in data_nodes if isinstance(d, dict) and "id" in d}

    def read_source(from_node_id: str, from_field: str) -> list[str]:
        # 1) Upstream executable: read the projected view.
        view = output_views.get(from_node_id)
        if view is not None:
            channel = view.get(from_field)
            return list(channel["values"]) if channel else []
        # 2) Upstream data node: read live state (texts / fileKeys).
        slot = data_node_state.get(from_node_id)
        if slot is not None:
            if from_field == "texts" and slot.get("texts"):
                return list(slot["texts"])
            if from_field == "fileKeys" and slot.get("fileKeys"):
                return list(slot["fileKeys"])
        # 3) Workflow input fallback (data node with inputName).
        dn = data_node_map.get(from_node_id)
        if dn and dn.get("inputName"):
            supplied = inputs.get(dn["inputName"])
            if isinstance(supplied, dict):
                arr = supplied.get(from_field)
                if isinstance(arr, list):
                    return [str(v) for v in arr]
            elif isinstance(supplied, list):
                return [str(v) for v in supplied]
            elif isinstance(supplied, str):
                return [supplied]
        return []

    for field, binding in bindings.items():
        kind = binding.get("kind")
        if kind == "handle":
            collected: list[str] = []
            for s in binding.get("sources", []):
                collected.extend(read_source(s["fromNodeId"], s["fromField"]))
            if binding.get("consumerShape") == "scalar":
                if collected:
                    params[field] = collected[0]
            else:
                params[field] = collected
        elif kind in ("config", "static"):
            params[field] = binding.get("value")
        elif kind == "input":
            params[field] = inputs.get(binding["inputName"])
    return params
