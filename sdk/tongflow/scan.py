from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path

from .abi import load_abi
from ._ast_utils import extract_node_slot_decorators, looks_like_sdk_model_type
from .parse_deploy import _slot_to_ident, parse_deploy_py, resolve_methods_by_slot

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

    if has_deploy and has_entry:
        return None, (
            f"{plugin_dir}:1: both deploy.py and entry.py exist; "
            "fix: keep deploy.py for Modal or entry.py for LLM, not both"
        )
    if not has_deploy and not has_entry:
        return None, (
            f"{plugin_dir}:1: missing deploy.py or entry.py; "
            "fix: add deploy.py for Modal or entry.py for LLM"
        )

    if prefix_runner == "modal" and has_deploy:
        return "modal", None
    if prefix_runner == "llm" and has_entry:
        return "llm", None

    expected = "deploy.py" if prefix_runner == "modal" else "entry.py"
    unexpected = "entry.py" if prefix_runner == "modal" else "deploy.py"
    return None, (
        f"{plugin_dir}:1: prefix says {prefix_runner} but found {unexpected}; "
        f"fix: use {expected} or rename the plugin prefix"
    )


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
        runner, runner_error = _detect_runner(pdir)
        if runner_error:
            errors.append({"pluginId": plugin_id, "message": runner_error})
            continue

        if runner == "modal":
            deploy = pdir / "deploy.py"

            dscan, perr = parse_deploy_py(deploy)
            if dscan is None or perr:
                message = perr
                if message and "; fix:" not in message:
                    message = _scan_error(deploy, message, "fix deploy.py")
                errors.append(
                    {
                        "pluginId": plugin_id,
                        "message": message
                        or _scan_error(deploy, "parse_deploy failed", "fix deploy.py"),
                    }
                )
                continue

            methods, merr = resolve_methods_by_slot(dscan, valid)
            if merr or not methods:
                message = merr
                if message and "; fix:" not in message:
                    message = _scan_error(
                        deploy,
                        message,
                        "use a NodeSlots constant generated from the ABI",
                    )
                errors.append(
                    {
                        "pluginId": plugin_id,
                        "message": message
                        or _scan_error(
                            deploy,
                            "no methods for slots",
                            "add @node_slot(NodeSlots.XXX) methods with Input/Output annotations",
                        ),
                    }
                )
                continue

            # Enforce explicit SDK registration (decorators + annotations)
            if not dscan.methods_by_slot:
                errors.append(
                    {
                        "pluginId": plugin_id,
                        "message": _scan_error(
                            deploy,
                            "SDK required",
                            "use @node_slot(NodeSlots.XXX) and add type annotations",
                        ),
                    }
                )
                continue

            ident_to_slot = {_slot_to_ident(s): s for s in valid}
            cls_for_slot: dict[str, str] = {}
            if dscan.cls_by_slot:
                for ident, cname in dscan.cls_by_slot.items():
                    abi_slot = ident_to_slot.get(ident)
                    if abi_slot:
                        cls_for_slot[abi_slot] = cname
            mjson: dict[str, dict[str, object]] = {}
            for slot, method in methods.items():
                row: dict[str, object] = {"methodName": method}
                if slot in cls_for_slot:
                    row["clsName"] = cls_for_slot[slot]
                mjson[slot] = row

            for slot, _mn in methods.items():
                node_plugin_map.setdefault(str(slot), [])
                if plugin_id not in node_plugin_map[str(slot)]:
                    node_plugin_map[str(slot)].append(plugin_id)

            plugins[plugin_id] = {
                "runner": "modal",
                "runners": {
                    "modal": {
                        "appName": plugin_id,
                        "clsName": dscan.cls_name,
                        "localSubdir": plugin_id,
                        "deployFile": "deploy.py",
                        "downloadFile": "download.py",
                        "methodsByNodeSlot": mjson,
                    }
                },
            }
            continue

        # runner == llm
        methods_by_ident = _scan_methods_by_slot_in_dir(pdir)
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

        plugins[plugin_id] = {
            "runner": "llm",
            "runners": {
                "llm": {
                    "methodsByNodeSlot": llm_methods,
                    "localSubdir": plugin_id,
                    "entryFile": "entry.py",
                }
            },
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
