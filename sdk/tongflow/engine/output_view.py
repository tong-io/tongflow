"""Project a plugin's raw output into an ABI-shaped view.

Direct translation of ``computeOutputView`` in ``src/lib/task/payload.ts``.
Each output route's ``values`` is normalized to a flat ``list[str]``: asset
``$ref`` objects yield their ``itemValuePath`` (typically ``file_key``), scalars
are wrapped into a single-element list, arrays are flattened.
"""

from __future__ import annotations

from typing import Any, Optional


def _extract_item_value(item: Any, item_value_path: Optional[str]) -> Optional[str]:
    if item is None:
        return None
    if item_value_path and isinstance(item, dict):
        v = item.get(item_value_path)
        if v is None:
            return None
        s = str(v)
        return s if s and s != "undefined" else None
    if isinstance(item, str):
        return item or None
    s = str(item)
    return s if s and s != "undefined" else None


def compute_output_view(
    routes: list[dict[str, Any]],
    payload: Optional[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    view: dict[str, dict[str, Any]] = {}
    if not payload:
        return view
    for route in routes:
        source_field = route.get("sourceField")
        if not isinstance(source_field, str):
            continue
        raw = payload.get(source_field)
        if raw is None:
            continue
        item_value_path = route.get("itemValuePath")
        values: list[str] = []
        if isinstance(raw, list):
            if route.get("isArrayOfArrays"):
                for inner in raw:
                    if not isinstance(inner, list):
                        continue
                    for item in inner:
                        v = _extract_item_value(item, item_value_path)
                        if v:
                            values.append(v)
            else:
                for item in raw:
                    v = _extract_item_value(item, item_value_path)
                    if v:
                        values.append(v)
        else:
            v = _extract_item_value(raw, item_value_path)
            if v:
                values.append(v)
        if not values:
            continue
        view[source_field] = {
            "sourceField": source_field,
            "nodeType": route.get("nodeType"),
            "dataField": route.get("dataField"),
            "expandEach": bool(route.get("expandEach", False)),
            "values": values,
        }
    return view
