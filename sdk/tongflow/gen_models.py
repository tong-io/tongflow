from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def slot_to_ident(slot: str) -> str:
    s = slot.upper()
    s = re.sub(r"[^A-Z0-9]+", "_", s).strip("_")
    if not s:
        return "UNKNOWN"
    if s[0].isdigit():
        s = f"S_{s}"
    return s


def slot_to_module(slot: str) -> str:
    s = slot.lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    if not s:
        return "unknown"
    if s[0].isdigit():
        s = f"s_{s}"
    return s


def read_abi_nodes(abi_path: Path) -> list[dict[str, Any]]:
    raw: dict[str, Any] = json.loads(abi_path.read_text(encoding="utf-8"))
    nodes = raw.get("nodes")
    if not isinstance(nodes, list):
        raise ValueError("ABI missing nodes[]")
    out: list[dict[str, Any]] = []
    for n in nodes:
        if isinstance(n, dict) and isinstance(n.get("nodeSlot"), str):
            out.append(n)
    return out


def _pascal(s: str) -> str:
    return "".join(p[:1].upper() + p[1:] for p in re.split(r"[^A-Za-z0-9]+", s) if p)


def _nested_name(slot_pascal: str, role: str, path: str) -> str:
    """role is 'Input' or 'Output'."""
    tail = _pascal(path.replace(".", "_"))
    return f"{slot_pascal}{role}{tail}"


def _type_expr(
    prop: dict[str, Any],
    defs: dict[str, Any],
    slot_pascal: str,
    role: str,
    path: str,
    depth: int,
    pending: list[tuple[str, str]],
) -> str:
    if depth > 32:
        raise ValueError("Schema nesting too deep")

    if "$ref" in prop:
        ref = str(prop["$ref"])
        # Output-side asymmetry: ABI declares *Ref types for output fields, but
        # plugins actually emit `Asset` (bytesBase64) — the server-side
        # `convertAssetOutputsToFileRefs` uploads bytes and rewrites them to
        # `{ file_key }` before downstream consumers see VideoRef/etc. So for
        # outputs we type *Ref fields as `Asset` (the plugin-emitted shape).
        if role == "Output" and ref in {
            "#/$defs/FileRef",
            "#/$defs/ImageRef",
            "#/$defs/VideoRef",
            "#/$defs/AudioRef",
            "#/$defs/ModelRef",
        }:
            return "Asset"
        if ref == "#/$defs/Asset":
            return "Asset"
        if ref == "#/$defs/FileRef":
            return "FileRef"
        if ref == "#/$defs/ImageRef":
            return "ImageRef"
        if ref == "#/$defs/VideoRef":
            return "VideoRef"
        if ref == "#/$defs/AudioRef":
            return "AudioRef"
        if ref == "#/$defs/ModelRef":
            return "ModelRef"
        raise ValueError(f"Unsupported $ref: {ref}")

    t = prop.get("type")
    if t == "string":
        return "str"
    if t == "number":
        return "float"
    if t == "integer":
        return "int"
    if t == "boolean":
        return "bool"
    if t == "array":
        items = prop.get("items")
        if not isinstance(items, dict):
            raise ValueError("array items must be object")
        inner = _type_expr(
            items, defs, slot_pascal, role, f"{path}_item", depth + 1, pending
        )
        return f"list[{inner}]"
    if t == "object":
        name = _nested_name(slot_pascal, role, path)
        body = _build_class_body(prop, defs, slot_pascal, role, path, pending)
        pending.append((name, body))
        return f'"{name}"'

    raise ValueError(f"Unsupported property schema: {prop!r}")


def _build_class_body(
    schema: dict[str, Any],
    defs: dict[str, Any],
    slot_pascal: str,
    role: str,
    path: str,
    pending: list[tuple[str, str]],
) -> str:
    """Render a Pydantic BaseModel body for a JSON Schema object.

    Pydantic field ordering rule: fields without a default must come before
    fields with a default. We emit required fields first, then optional ones
    as ``field: T | None = None``.
    """
    if schema.get("type") != "object":
        raise ValueError("Expected object")
    props = schema.get("properties")
    if not isinstance(props, dict):
        raise ValueError("object must have properties")

    req = schema.get("required")
    required: set[str] = set(req) if isinstance(req, list) else set()

    required_lines: list[str] = []
    optional_lines: list[str] = []
    for key in sorted(props.keys()):
        p = props[key]
        if not isinstance(p, dict):
            raise ValueError(f"Bad property {key!r}")
        typ = _type_expr(
            p, defs, slot_pascal, role, f"{path}.{key}", 0, pending
        )
        if key in required:
            required_lines.append(f"    {key}: {typ}")
        else:
            optional_lines.append(f"    {key}: {typ} | None = None")

    body_lines: list[str] = ['    model_config = ConfigDict(extra="forbid")', ""]
    body_lines.extend(required_lines)
    body_lines.extend(optional_lines)
    # Pydantic v2 requires at least a class body; the model_config line covers it
    # even when there are zero properties.
    return "\n".join(body_lines)


def write_models(out_dir: Path, nodes: list[dict[str, Any]], defs: dict[str, Any]) -> None:
    _ = defs
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "__init__.py").write_text(
        "\"\"\"Generated models from tongflow ABI.\"\"\"\n",
        encoding="utf-8",
    )

    # NOTE: `asset.py` is intentionally NOT regenerated here. The Asset / *Ref
    # Pydantic models live as a hand-maintained file (matching ABI $defs) so
    # we keep their pydantic ConfigDict / field defaults stable across runs.

    for n in nodes:
        slot = str(n["nodeSlot"])
        mod = slot_to_module(slot)
        slot_pascal = slot_to_ident(slot).title().replace("_", "")

        inputs = n.get("inputs")
        outputs = n.get("outputs")
        if not isinstance(inputs, dict) or not isinstance(outputs, dict):
            raise ValueError(f"Node {slot!r} missing inputs/outputs in ABI")

        input_name = f"{slot_pascal}Input"
        output_name = f"{slot_pascal}Output"

        in_pending: list[tuple[str, str]] = []
        in_body = _build_class_body(
            inputs, defs, slot_pascal, "Input", "root", in_pending
        )
        out_pending: list[tuple[str, str]] = []
        out_body = _build_class_body(
            outputs, defs, slot_pascal, "Output", "root", out_pending
        )

        # Nested classes are appended while building; emit them before roots.
        # Deduplicate by name (later body wins — should be identical).
        nested: dict[str, str] = {}
        for nm, bd in in_pending:
            nested[nm] = bd
        for nm, bd in out_pending:
            nested[nm] = bd

        lines: list[str] = [
            "from __future__ import annotations\n",
            "from pydantic import BaseModel, ConfigDict\n",
            "from .asset import Asset, AudioRef, FileRef, ImageRef, ModelRef, VideoRef\n",
            "",
        ]

        root_in_nested = _nested_name(slot_pascal, "Input", "root")
        root_out_nested = _nested_name(slot_pascal, "Output", "root")

        for nm, bd in nested.items():
            if nm in (root_in_nested, root_out_nested):
                continue
            lines.extend([f"class {nm}(BaseModel):", bd, ""])

        lines.extend(
            [
                f"class {input_name}(BaseModel):",
                in_body,
                "",
                f"class {output_name}(BaseModel):",
                out_body,
                "",
            ]
        )

        (out_dir / f"{mod}.py").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--abi", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, required=True)
    ns = ap.parse_args()
    raw = json.loads(ns.abi.read_text(encoding="utf-8"))
    defs = raw.get("$defs")
    if not isinstance(defs, dict):
        defs = {}
    nodes = read_abi_nodes(ns.abi)
    write_models(ns.out_dir, nodes, defs)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
