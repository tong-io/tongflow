from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path

from .abi import load_abi
from ._ast_utils import extract_node_slot_decorators, looks_like_sdk_model_type
from .parse_deploy import _slot_to_ident, parse_deploy_py

SCANNER_VERSION = 1

SKIP_DIR_NAMES = frozenset(
    {
        "tongflow",
        ".git",
        "__pycache__",
        ".ruff_cache",
        "node_modules",
    }
)


def _iter_plugin_dirs(plugins_root: Path) -> list[Path]:
    if not plugins_root.is_dir():
        return []
    out: list[Path] = []
    for child in sorted(plugins_root.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith(".") and child.name != ".":  # noqa: SIM102
            continue
        if child.name in SKIP_DIR_NAMES:
            continue
        out.append(child)
    return out


def _detect_runner(plugin_dir: Path) -> tuple[str | None, str | None]:
    deploy = plugin_dir / "deploy.py"
    entry = plugin_dir / "entry.py"
    has_deploy = deploy.is_file()
    has_entry = entry.is_file()
    plugin_id = plugin_dir.name

    # pluginId is case-sensitive and used as a key everywhere (Modal appName,
    # localSubdir, node_plugin_map). A repo/dir name with uppercase letters would
    # silently miss the lowercase prefix checks below and be reported as an
    # "unknown prefix"; surface a clear rename hint instead.
    lowered = plugin_id.lower()
    if plugin_id != lowered and (
        lowered.startswith("tongflow-modal-") or lowered.startswith("tongflow-llm-")
    ):
        return None, (
            f"{plugin_dir}:1: pluginId must be all lowercase; "
            f"fix: rename the plugin repo/dir to {lowered}"
        )

    if plugin_id.startswith("tongflow-modal-gpu-") or plugin_id.startswith(
        "tongflow-modal-cpu-"
    ):
        return None, (
            f"{plugin_dir}:1: pluginId must not encode gpu/cpu; "
            "fix: use tongflow-modal-<semantic-name>"
        )
    if plugin_id.startswith("tongflow-llm-gpu-") or plugin_id.startswith(
        "tongflow-llm-cpu-"
    ):
        return None, (
            f"{plugin_dir}:1: pluginId must not encode gpu/cpu; "
            "fix: use tongflow-llm-<semantic-name>"
        )

    prefix_runner: str | None = None
    if plugin_id.startswith("tongflow-modal-"):
        prefix_runner = "modal"
    elif plugin_id.startswith("tongflow-llm-"):
        prefix_runner = "llm"
    else:
        return None, (
            f"{plugin_dir}:1: unknown pluginId prefix; "
            "fix: use tongflow-modal-<name> or tongflow-llm-<name>"
        )

    if not has_deploy and not has_entry:
        return None, (
            f"{plugin_dir}:1: missing deploy.py or entry.py; "
            "fix: add an entry.py, or a deploy.py for a Modal-backed plugin"
        )

    # Every plugin runs the same way: the platform spawns the plugin's local
    # entry and exchanges JSON. The runner is no longer an execution backend —
    # a plugin with entry.py runs that file; a deploy.py plugin is bridged to
    # its backend by the SDK (tongflow.modal_entry), needing no per-repo entry.
    # "llm" is kept as the registry's single generic-runner tag.
    return "llm", None


def _scan_error(path: Path, reason: str, hint: str, line: int = 1) -> str:
    return f"{path}:{line}: {reason}; fix: {hint}"


def _scan_methods_by_slot_in_file(path: Path) -> dict[str, str]:
    try:
        src = path.read_text(encoding="utf-8")
        tree = ast.parse(src, filename=str(path))
    except (OSError, SyntaxError):
        return {}

    out: dict[str, str] = {}

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name.startswith("_"):
            continue
        # Strict typing: require 1st arg annotation + return annotation (SDK models).
        if not node.args.args:
            continue
        first = node.args.args[0]
        if first.annotation is None or node.returns is None:
            continue
        if not looks_like_sdk_model_type(first.annotation, "Input", tree):
            continue
        if not looks_like_sdk_model_type(node.returns, "Output", tree):
            continue
        slots = extract_node_slot_decorators(node)
        for s in slots:
            out[s] = node.name
    return out


def _scan_methods_by_slot_in_dir(plugin_dir: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for p in plugin_dir.rglob("*.py"):
        if any(part in {"__pycache__", ".venv", "node_modules"} for part in p.parts):
            continue
        for slot_ident, method in _scan_methods_by_slot_in_file(p).items():
            out.setdefault(slot_ident, method)
    return out


def scan(plugins_root: Path, abi_path: Path) -> dict[str, object]:
    abi = load_abi(abi_path)
    valid = abi.node_slots

    node_plugin_map: dict[str, list[str]] = {}
    plugins: dict[str, dict[str, object]] = {}
    errors: list[dict[str, str]] = []

    for pdir in _iter_plugin_dirs(plugins_root):
        plugin_id = pdir.name
        _runner, runner_error = _detect_runner(pdir)
        if runner_error:
            errors.append({"pluginId": plugin_id, "message": runner_error})
            continue

        # Generic runner: the platform spawns the plugin's local entry and
        # exchanges JSON. Handlers are discovered by scanning every .py file for
        # @node_slot + SDK annotations.
        methods_by_ident = _scan_methods_by_slot_in_dir(pdir)
        # A backend-bridged plugin (e.g. Modal) keeps its handlers as @app.cls
        # methods in deploy.py — first arg `self`, so the module-level dir scan
        # skips them. Fall back to the deploy parser for the slot list; the
        # generic runner only needs *which* slots the plugin implements (it
        # dispatches in-process via tongflow.modal_entry), not the method name.
        is_bridged = False
        if not methods_by_ident and (pdir / "deploy.py").is_file():
            dscan, _derr = parse_deploy_py(pdir / "deploy.py")
            if dscan and dscan.methods_by_slot:
                methods_by_ident = dict(dscan.methods_by_slot)
                is_bridged = True
        if not methods_by_ident:
            errors.append(
                {
                    "pluginId": plugin_id,
                    "message": _scan_error(
                        pdir / "entry.py",
                        "no @node_slot(NodeSlots.XXX) methods found",
                        "add @node_slot and Input/Output annotations to entry.py",
                    ),
                }
            )
            continue

        ident_to_slot = {_slot_to_ident(s): s for s in valid}
        llm_methods: dict[str, dict[str, object]] = {}
        for ident, method_name in methods_by_ident.items():
            slot = ident_to_slot.get(ident)
            if not slot:
                errors.append(
                    {
                        "pluginId": plugin_id,
                        "message": _scan_error(
                            pdir / "entry.py",
                            f"unknown NodeSlots.{ident} (not in tongflow.abi.json)",
                            "use a NodeSlots constant generated from the ABI",
                        ),
                    }
                )
                continue
            llm_methods[slot] = {"methodName": method_name}
            node_plugin_map.setdefault(slot, [])
            if plugin_id not in node_plugin_map[slot]:
                node_plugin_map[slot].append(plugin_id)

        if not llm_methods:
            continue

        entry: dict[str, object] = (
            {"entryModule": "tongflow.modal_entry"}
            if is_bridged
            else {"entryFile": "entry.py"}
        )
        plugins[plugin_id] = {
            "localSubdir": plugin_id,
            "methodsByNodeSlot": llm_methods,
            **entry,
        }

    # de-dupe lists, preserve order
    for k in list(node_plugin_map.keys()):
        seen: set[str] = set()
        nxt: list[str] = []
        for x in node_plugin_map[k]:
            if x in seen:
                continue
            seen.add(x)
            nxt.append(x)
        node_plugin_map[k] = nxt

    return {
        "version": 1,
        "generatedAt": _iso_now(),
        "scannerVersion": SCANNER_VERSION,
        "nodePluginMap": node_plugin_map,
        "plugins": plugins,
        "errors": errors,
    }


def _iso_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Scan Tongflow local plugins/ and print registry JSON (stdout).",
    )
    ap.add_argument(
        "--root",
        type=Path,
        default=Path("plugins"),
        help="Directory that contains one folder per plugin (default: ./plugins).",
    )
    ap.add_argument(
        "--abi",
        type=Path,
        default=Path("config/tongflow.abi.json"),
        help="Path to tongflow.abi.json",
    )
    ns = ap.parse_args()
    root = ns.root if ns.root.is_absolute() else (Path.cwd() / ns.root).resolve()
    abi = ns.abi if ns.abi.is_absolute() else (Path.cwd() / ns.abi).resolve()
    if not abi.is_file():
        err = {
            "version": 1,
            "errors": [
                {
                    "pluginId": "<scan>",
                    "message": _scan_error(
                        abi,
                        "missing ABI",
                        "pass --abi pointing to tongflow.abi.json",
                    ),
                }
            ],
        }
        print(json.dumps(err, ensure_ascii=True))
        return 0

    payload = scan(root, abi)
    print(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    main()
