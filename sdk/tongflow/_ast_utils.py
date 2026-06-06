"""Shared AST helpers for deploy scan and repo scanners."""

from __future__ import annotations

import ast


def _collect_models_roots(tree: ast.Module) -> frozenset[str]:
    """
    Names bound to ``tongflow.models`` submodules, e.g.
    ``from tongflow.models.gen_text import GenTextInput`` or
    ``import tongflow.models.gen_text as gen_text``.

    Imports inside ``try:`` / ``except:`` blocks are included (common in deploy.py
    fallbacks when tongflow is optional at ``modal deploy`` parse time).
    """

    out: set[str] = set()

    def take_import_stmt(node: ast.stmt) -> None:
        if isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if mod == "tongflow.models" or mod.startswith("tongflow.models."):
                for alias in node.names:
                    if alias.name == "*":
                        continue
                    out.add(alias.asname or alias.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                base = alias.name
                if base == "tongflow.models" or base.startswith(
                    "tongflow.models.",
                ):
                    tail = base.rsplit(".", 1)[-1]
                    out.add(alias.asname or tail)

    def walk_body(body: list[ast.stmt]) -> None:
        for node in body:
            take_import_stmt(node)
            if isinstance(node, ast.Try):
                walk_body(node.body)
                for h in node.handlers:
                    walk_body(h.body)
                if node.orelse:
                    walk_body(node.orelse)
                if node.finalbody:
                    walk_body(node.finalbody)

    walk_body(tree.body)
    return frozenset(out)


def _attr_chain_root_models(expr: ast.expr, roots: frozenset[str]) -> bool:
    cur: ast.expr = expr
    while isinstance(cur, ast.Attribute):
        cur = cur.value
    return isinstance(cur, ast.Name) and cur.id in roots


def looks_like_sdk_model_type(
    expr: ast.expr,
    suffix: str,
    module: ast.Module | None,
) -> bool:
    """
    Slot IO annotations must live under ``tongflow.models`` (imported symbols or
    ``models.foo.BarInput``-style chains rooted in a ``tongflow.models`` import).
    """

    if isinstance(expr, ast.Subscript):
        return looks_like_sdk_model_type(expr.value, suffix, module)

    roots = _collect_models_roots(module) if module is not None else frozenset()

    if isinstance(expr, ast.Attribute):
        if not expr.attr.endswith(suffix):
            return False
        if module is None:
            return True
        return _attr_chain_root_models(expr.value, roots)

    if isinstance(expr, ast.Name):
        if not expr.id.endswith(suffix):
            return False
        if module is None:
            return True
        return expr.id in roots

    return False


def decorator_name(expr: ast.expr) -> str | None:
    if isinstance(expr, ast.Name):
        return expr.id
    if isinstance(expr, ast.Attribute):
        return expr.attr
    if isinstance(expr, ast.Call):
        return decorator_name(expr.func)
    return None


def extract_node_slot_decorators(
    fn: ast.FunctionDef | ast.AsyncFunctionDef,
) -> tuple[str, ...]:
    """Collect ``NodeSlots.<ident>`` arguments from ``@node_slot(...)`` calls."""

    slots: list[str] = []
    for deco in fn.decorator_list:
        if not isinstance(deco, ast.Call):
            continue
        name = decorator_name(deco.func)
        if name != "node_slot":
            continue
        for arg in deco.args:
            if (
                isinstance(arg, ast.Attribute)
                and isinstance(arg.value, ast.Name)
                and arg.value.id == "NodeSlots"
                and isinstance(arg.attr, str)
                and arg.attr
            ):
                slots.append(arg.attr)
    return tuple(slots)
