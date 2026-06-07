from __future__ import annotations

import ast
from dataclasses import dataclass, field
from pathlib import Path

from ._ast_utils import (
    extract_node_slot_decorators,
    looks_like_sdk_model_type,
)


@dataclass(frozen=True)
class DeployScan:
    cls_name: str
    method_names: frozenset[str]
    methods_by_slot: dict[str, str]
    cls_by_slot: dict[str, str] = field(default_factory=dict)


def _const_str(node: ast.expr | None) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _tuple_or_list_of_str(node: ast.expr) -> tuple[str, ...] | None:
    items: list[str] = []
    if isinstance(node, (ast.Tuple, ast.List)):
        for elt in node.elts:
            s = _const_str(elt)
            if s is None:
                return None
            items.append(s)
        return tuple(items)
    if (s := _const_str(node)) is not None:
        return (s,)
    return None


def _parse_class_methods(cls: ast.ClassDef) -> frozenset[str]:
    out: set[str] = set()
    for stmt in cls.body:
        if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if not stmt.name.startswith("_"):
                out.add(stmt.name)
    return frozenset(out)


def _parse_methods_by_slot(cls: ast.ClassDef, tree: ast.Module) -> dict[str, str]:
    out: dict[str, str] = {}
    for stmt in cls.body:
        if not isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if stmt.name.startswith("_"):
            continue
        # Strict typing: task arg + return annotation required
        if len(stmt.args.args) < 2:
            continue
        task_arg = stmt.args.args[1]
        if task_arg.annotation is None or stmt.returns is None:
            continue
        # Strict typing: require using SDK-generated types (models.*Input/Output)
        if not looks_like_sdk_model_type(task_arg.annotation, "Input", tree):
            continue
        if not looks_like_sdk_model_type(stmt.returns, "Output", tree):
            continue
        slots = extract_node_slot_decorators(stmt)
        for s in slots:
            out[s] = stmt.name
    return out


def _is_deploy_decorator(deco: ast.expr) -> bool:
    """Match tongflow's backend-neutral ``@deploy`` marker.

    Accepts a bare ``@deploy`` (``ast.Name``) or a qualified ``@tongflow.deploy``
    (``ast.Attribute``). This is the SDK's own marker, so the scanner needs no
    knowledge of any backend's class decorator (e.g. Modal's ``@app.cls``).
    """
    if isinstance(deco, ast.Name):
        return deco.id == "deploy"
    if isinstance(deco, ast.Attribute):
        return deco.attr == "deploy"
    return False


def _parse_deploy_classes(
    tree: ast.Module,
) -> tuple[dict[str, str], dict[str, str], frozenset[str], str | None]:
    """
    Collect ``@node_slot`` methods from every class decorated with ``@deploy``.

    Returns (methods_by_slot, cls_by_slot, public_method_names, error).
    Ident keys match :class:`DeployScan.methods_by_slot` (NodeSlots attribute names).
    """
    merged_mb: dict[str, str] = {}
    merged_cls: dict[str, str] = {}
    all_names: set[str] = set()

    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        if not any(_is_deploy_decorator(d) for d in node.decorator_list):
            continue
        all_names |= set(_parse_class_methods(node))
        mb = _parse_methods_by_slot(node, tree)
        for ident, method in mb.items():
            if ident in merged_mb:
                return {}, {}, frozenset(), (
                    f"Duplicate @node_slot({ident!r}) on multiple @deploy classes "
                    f"({merged_cls.get(ident)!r} vs {node.name!r})"
                )
            merged_mb[ident] = method
            merged_cls[ident] = node.name

    return merged_mb, merged_cls, frozenset(all_names), None


def parse_deploy_py(path: Path) -> tuple[DeployScan | None, str | None]:
    """Return (scan, error). On recoverable issues error is set; scan may still be partial."""
    try:
        src = path.read_text(encoding="utf-8")
    except OSError as e:
        return None, f"{path}:1: read failed: {e}; fix: make deploy.py readable"
    try:
        tree = ast.parse(src, filename=str(path))
    except SyntaxError as e:
        line = e.lineno or 1
        return None, f"{path}:{line}: syntax error: {e.msg}; fix: correct Python syntax"

    cls_name = "Inference"
    method_names: frozenset[str] = frozenset()
    methods_by_slot: dict[str, str] = {}
    cls_by_slot: dict[str, str] = {}

    dep_mb, dep_cls, dep_mnames, dep_err = _parse_deploy_classes(tree)
    if dep_err:
        return None, f"{path}:1: {dep_err}; fix: keep one @node_slot implementation per slot"

    if dep_mb:
        methods_by_slot = dep_mb
        cls_by_slot = dict(dep_cls)
        method_names = dep_mnames
        cls_name = sorted(set(dep_cls.values()))[0]
    else:
        for node in tree.body:
            if isinstance(node, ast.ClassDef) and node.name == "Inference":
                method_names = _parse_class_methods(node)
                cls_name = "Inference"
                methods_by_slot = _parse_methods_by_slot(node, tree)

    return (
        DeployScan(
            cls_name=cls_name,
            method_names=method_names,
            methods_by_slot=methods_by_slot,
            cls_by_slot=cls_by_slot,
        ),
        None,
    )


def resolve_methods_by_slot(
    d: DeployScan,
    valid_slots: frozenset[str],
) -> tuple[dict[str, str] | None, str | None]:
    """
    Build nodeSlot -> handler method name.

    1) Preferred: `@node_slot("...")` decorators on methods.
    2) Fallback: method names that match ABI slots (for legacy repos).
    """
    m = d.method_names
    out: dict[str, str] = {}

    if d.methods_by_slot:
        # d.methods_by_slot keys are NodeSlots.<IDENT> names. Map them back to slot strings via ABI.
        ident_to_slot = { _slot_to_ident(s): s for s in valid_slots }
        for ident, method in d.methods_by_slot.items():
            slot = ident_to_slot.get(ident)
            if not slot:
                return None, f"Unknown NodeSlots.{ident} (not in tongflow.abi.json)"
            out[slot] = method
        return out, None

    # Heuristic: method names that match ABI slots
    for name in m:
        if name in valid_slots:
            out[name] = name

    if not out:
        return None, "Missing @node_slot(NodeSlots.XXX) decorators or missing type annotations"
    return out, None


def _slot_to_ident(slot: str) -> str:
    import re

    s = slot.upper()
    s = re.sub(r"[^A-Z0-9]+", "_", s).strip("_")
    if not s:
        return "UNKNOWN"
    if s[0].isdigit():
        s = f"S_{s}"
    return s
