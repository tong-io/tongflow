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


def load_slots(abi_path: Path) -> list[str]:
    raw: dict[str, Any] = json.loads(abi_path.read_text(encoding="utf-8"))
    nodes = raw.get("nodes")
    if not isinstance(nodes, list):
        raise ValueError("ABI missing nodes[]")
    out: list[str] = []
    seen: set[str] = set()
    for n in nodes:
        if not isinstance(n, dict):
            continue
        s = n.get("nodeSlot")
        if isinstance(s, str) and s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def generate_node_slots_py(slots: list[str]) -> str:
    lines: list[str] = []
    lines.append('"""Generated from config/tongflow.abi.json. DO NOT EDIT."""')
    lines.append("")
    lines.append("from __future__ import annotations")
    lines.append("")
    lines.append("import re")
    lines.append("from typing import Final")
    lines.append("")
    lines.append("")
    lines.append("def _slot_to_ident(slot: str) -> str:")
    lines.append("    s = slot.upper()")
    lines.append("    s = re.sub(r\"[^A-Z0-9]+\", \"_\", s).strip(\"_\")")
    lines.append("    if not s:")
    lines.append("        return \"UNKNOWN\"")
    lines.append("    if s[0].isdigit():")
    lines.append("        s = f\"S_{s}\"")
    lines.append("    return s")
    lines.append("")
    lines.append("")
    lines.append("class NodeSlots:")
    lines.append("    \"\"\"ABI nodeSlot constants. Use these in @node_slot(...)\"\"\"")
    for slot in slots:
        ident = slot_to_ident(slot)
        lines.append(f"    {ident}: Final[str] = {slot!r}")
    lines.append("")
    lines.append("")
    lines.append("ALL_NODE_SLOTS: Final[tuple[str, ...]] = (")
    for slot in slots:
        lines.append(f"    {slot!r},")
    lines.append(")")
    lines.append("")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--abi", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ns = ap.parse_args()

    slots = load_slots(ns.abi)
    text = generate_node_slots_py(slots)
    ns.out.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

