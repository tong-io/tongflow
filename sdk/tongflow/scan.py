from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path
from typing import Any

from .abi import load_abi
from ._ast_utils import (
    DEFAULT_SLOTS_CONST,
    MODEL_CATALOG_CONST,
    SLOT_MODELS_CONST,
    SLOT_PARAMS_CONST,
    extract_default_slots,
    extract_model_catalog,
    extract_node_slot_decorators,
    extract_node_slot_defaults,
    extract_slot_models,
    extract_slot_params,
    looks_like_sdk_model_type,
)
from .parse_deploy import _slot_to_ident, parse_deploy_py

SCANNER_VERSION = 9

# Edge (browser) plugins are TypeScript packages the browser edge runtime loads;
# the scanner reads their declarative manifest instead of Python sources.
EDGE_PREFIX = "tongflow-edge-"
PLUGIN_MANIFEST_FILE = "tongflow.plugin.json"
RUNTIME_PYTHON = "python"
RUNTIME_BROWSER = "browser"

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
        lowered.startswith("tongflow-modal-")
        or lowered.startswith("tongflow-api-")
        or lowered.startswith("tongflow-router-")
        or lowered.startswith("tongflow-local-")
        or lowered.startswith(EDGE_PREFIX)
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
    if plugin_id.startswith("tongflow-api-gpu-") or plugin_id.startswith(
        "tongflow-api-cpu-"
    ):
        return None, (
            f"{plugin_dir}:1: pluginId must not encode gpu/cpu; "
            "fix: use tongflow-api-<semantic-name>"
        )

    prefix_runner: str | None = None
    if plugin_id.startswith("tongflow-modal-"):
        prefix_runner = "modal"
    elif plugin_id.startswith("tongflow-api-"):
        prefix_runner = "api"
    elif plugin_id.startswith("tongflow-router-"):
        # Aggregator/router plugins (one key routing to many third-party models)
        # are entry.py-based local runners — identical execution to "api".
        prefix_runner = "api"
    elif plugin_id.startswith("tongflow-local-"):
        # On-device engine plugins (e.g. a native Metal binary) — entry.py-based
        # local runners like "api", named honestly: no key, no remote calls.
        prefix_runner = "api"
    elif plugin_id.startswith(EDGE_PREFIX):
        # Browser edge plugins: TypeScript, run by the browser edge runtime.
        # No entry.py — discovery reads tongflow.plugin.json instead.
        return RUNTIME_BROWSER, None
    else:
        return None, (
            f"{plugin_dir}:1: unknown pluginId prefix; "
            "fix: use tongflow-modal-<name>, tongflow-api-<name>, "
            "tongflow-router-<name>, tongflow-local-<name>, or tongflow-edge-<name>"
        )

    if not has_deploy and not has_entry:
        return None, (
            f"{plugin_dir}:1: missing deploy.py or entry.py; "
            "fix: add an entry.py, or a deploy.py for a Modal-backed plugin"
        )

    # Every plugin runs the same way: the platform spawns the plugin's local
    # entry.py and exchanges JSON. A simple plugin's entry.py does the work; a
    # deploy-first plugin's entry.py is a thin bridge that deploys (once) and
    # invokes the remote backend, discovering slot->method from its own deploy.py.
    # "api" is kept as the registry's single generic-runner tag.
    return "api", None


def _scan_error(path: Path, reason: str, hint: str, line: int = 1) -> str:
    return f"{path}:{line}: {reason}; fix: {hint}"


def _scan_methods_by_slot_in_file(
    path: Path,
) -> tuple[dict[str, str], set[str], list[str]]:
    """Returns (methods_by_slot_ident, default_slot_idents, problem messages)."""
    try:
        src = path.read_text(encoding="utf-8")
        tree = ast.parse(src, filename=str(path))
    except (OSError, SyntaxError):
        return {}, set(), []

    out: dict[str, str] = {}
    defaults: set[str] = set()
    problems: list[str] = []

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
        claimed, claim_problems = extract_node_slot_defaults(node)
        defaults.update(claimed)
        for lineno, reason in claim_problems:
            problems.append(
                _scan_error(path, reason, "pass a literal True", line=lineno)
            )
    return out, defaults, problems


def _scan_methods_by_slot_in_dir(
    plugin_dir: Path,
) -> tuple[dict[str, str], set[str], list[str]]:
    out: dict[str, str] = {}
    defaults: set[str] = set()
    problems: list[str] = []
    for p in _iter_plugin_py_files(plugin_dir):
        methods, file_defaults, file_problems = _scan_methods_by_slot_in_file(p)
        for slot_ident, method in methods.items():
            out.setdefault(slot_ident, method)
        defaults.update(file_defaults)
        problems.extend(file_problems)
    return out, defaults, problems


def _iter_plugin_py_files(plugin_dir: Path) -> list[Path]:
    return [
        p
        for p in plugin_dir.rglob("*.py")
        if not any(part in {"__pycache__", ".venv", "node_modules"} for part in p.parts)
    ]


def _scan_slot_models_in_dir(
    plugin_dir: Path,
) -> tuple[dict[str, list[str]], list[str]]:
    """Collect TONGFLOW_SLOT_MODELS declarations across the plugin's files."""

    models_by_slot: dict[str, list[str]] = {}
    problems: list[str] = []
    for p in _iter_plugin_py_files(plugin_dir):
        try:
            tree = ast.parse(p.read_text(encoding="utf-8"), filename=str(p))
        except (OSError, SyntaxError):
            continue
        found, file_problems = extract_slot_models(tree)
        for lineno, reason in file_problems:
            problems.append(
                _scan_error(
                    p,
                    reason,
                    "declare a pure literal dict[str, list[str]]",
                    line=lineno,
                )
            )
        for slot, models in found.items():
            if slot in models_by_slot:
                problems.append(
                    _scan_error(
                        p,
                        f"{SLOT_MODELS_CONST} declares slot {slot!r} more than once across files",
                        "keep one declaration per slot",
                    )
                )
                continue
            models_by_slot[slot] = models
    return models_by_slot, problems


def _scan_slot_params_in_dir(
    plugin_dir: Path,
) -> tuple[dict[str, dict[str, dict]], list[str]]:
    """Collect TONGFLOW_SLOT_PARAMS declarations across the plugin's files."""

    params_by_slot: dict[str, dict[str, dict]] = {}
    problems: list[str] = []
    for p in _iter_plugin_py_files(plugin_dir):
        try:
            tree = ast.parse(p.read_text(encoding="utf-8"), filename=str(p))
        except (OSError, SyntaxError):
            continue
        found, file_problems = extract_slot_params(tree)
        for lineno, reason in file_problems:
            problems.append(
                _scan_error(
                    p,
                    reason,
                    "declare a pure literal dict[slot, dict[name, spec]]",
                    line=lineno,
                )
            )
        for slot, params in found.items():
            if slot in params_by_slot:
                problems.append(
                    _scan_error(
                        p,
                        f"{SLOT_PARAMS_CONST} declares slot {slot!r} more than once across files",
                        "keep one declaration per slot",
                    )
                )
                continue
            params_by_slot[slot] = params
    return params_by_slot, problems


def _scan_model_catalog_in_dir(
    plugin_dir: Path,
) -> tuple[dict | None, list[str]]:
    """Collect the optional TONGFLOW_MODEL_CATALOG declaration (one per plugin)."""

    catalog: dict | None = None
    problems: list[str] = []
    for p in _iter_plugin_py_files(plugin_dir):
        try:
            tree = ast.parse(p.read_text(encoding="utf-8"), filename=str(p))
        except (OSError, SyntaxError):
            continue
        found, file_problems = extract_model_catalog(tree)
        for lineno, reason in file_problems:
            problems.append(
                _scan_error(
                    p,
                    reason,
                    "declare a pure literal dict with 'url' and 'slots'",
                    line=lineno,
                )
            )
        if found is None:
            continue
        if catalog is not None:
            problems.append(
                _scan_error(
                    p,
                    f"{MODEL_CATALOG_CONST} is declared more than once across files",
                    "keep one declaration per plugin",
                )
            )
            continue
        catalog = found
    return catalog, problems


def _scan_default_slots_in_dir(plugin_dir: Path) -> tuple[list[str], list[str]]:
    """Collect TONGFLOW_DEFAULT_SLOTS declarations across the plugin's files."""

    slots: list[str] = []
    problems: list[str] = []
    for p in _iter_plugin_py_files(plugin_dir):
        try:
            tree = ast.parse(p.read_text(encoding="utf-8"), filename=str(p))
        except (OSError, SyntaxError):
            continue
        found, file_problems = extract_default_slots(tree)
        for lineno, reason in file_problems:
            problems.append(
                _scan_error(
                    p,
                    reason,
                    "declare a pure list literal of slot strings",
                    line=lineno,
                )
            )
        for slot in found:
            if slot in slots:
                problems.append(
                    _scan_error(
                        p,
                        f"{DEFAULT_SLOTS_CONST} declares slot {slot!r} more than once "
                        "across files",
                        "keep one declaration per slot",
                    )
                )
                continue
            slots.append(slot)
    return slots, problems


def _scan_edge_plugin(
    plugin_dir: Path, valid_slots: "frozenset[str] | set[str]"
) -> tuple[dict[str, Any] | None, list[str]]:
    """Build the registry entry of a ``tongflow-edge-*`` (browser) plugin.

    Such a plugin is a TypeScript package; there is no Python to AST-scan, so
    its ``tongflow.plugin.json`` declares everything the registry needs::

        {
          "runtime": "browser",
          "entry": "dist/index.js",
          "slots": [{"nodeSlot": "ocr-image", "method": "ocrImage",
                     "models": ["pp-ocrv6"]}]
        }

    Returns ``(entry, problems)``; ``entry`` is ``None`` when the manifest is
    unusable or declares no valid slot. Problems use the scanner's usual
    ``path:line: reason; fix: hint`` shape.
    """

    manifest_path = plugin_dir / PLUGIN_MANIFEST_FILE
    problems: list[str] = []
    if not manifest_path.is_file():
        return None, [
            _scan_error(
                manifest_path,
                f"missing {PLUGIN_MANIFEST_FILE}",
                'add a manifest with runtime "browser", entry and slots',
            )
        ]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return None, [
            _scan_error(
                manifest_path,
                f"{PLUGIN_MANIFEST_FILE} is not valid JSON ({e})",
                "fix the JSON syntax",
            )
        ]
    if not isinstance(manifest, dict):
        return None, [
            _scan_error(
                manifest_path,
                f"{PLUGIN_MANIFEST_FILE} must be a JSON object",
                'declare {"runtime": "browser", "entry": ..., "slots": [...]}',
            )
        ]

    runtime = manifest.get("runtime")
    if runtime != RUNTIME_BROWSER:
        return None, [
            _scan_error(
                manifest_path,
                f"edge plugin must declare runtime {RUNTIME_BROWSER!r} "
                f"(got {runtime!r})",
                f'set "runtime": "{RUNTIME_BROWSER}"',
            )
        ]

    entry = manifest.get("entry")
    if not isinstance(entry, str) or not entry.strip():
        return None, [
            _scan_error(
                manifest_path,
                "missing entry (the plugin's ESM module path)",
                'set "entry" to the built module, e.g. "dist/index.js"',
            )
        ]
    entry = entry.strip()
    entry_rel = Path(entry)
    if entry_rel.is_absolute() or ".." in entry_rel.parts:
        return None, [
            _scan_error(
                manifest_path,
                f"entry {entry!r} must be a path inside the plugin directory",
                "use a relative path such as dist/index.js",
            )
        ]
    if not (plugin_dir / entry_rel).is_file():
        return None, [
            _scan_error(
                manifest_path,
                f"entry file {entry!r} not found",
                "build the plugin or point entry at an existing ESM module",
            )
        ]

    slots = manifest.get("slots")
    if not isinstance(slots, list) or not slots:
        return None, [
            _scan_error(
                manifest_path,
                "slots must be a non-empty list",
                'declare "slots": [{"nodeSlot": ..., "method": ...}]',
            )
        ]

    methods: dict[str, dict[str, object]] = {}
    for idx, item in enumerate(slots):
        where = f"slots[{idx}]"
        if not isinstance(item, dict):
            problems.append(
                _scan_error(
                    manifest_path,
                    f"{where} must be an object",
                    'use {"nodeSlot": ..., "method": ...}',
                )
            )
            continue
        slot = item.get("nodeSlot")
        method = item.get("method")
        if not isinstance(slot, str) or not slot:
            problems.append(
                _scan_error(
                    manifest_path,
                    f"{where} is missing nodeSlot",
                    "name an ABI nodeSlot, e.g. ocr-image",
                )
            )
            continue
        if slot not in valid_slots:
            problems.append(
                _scan_error(
                    manifest_path,
                    f"unknown nodeSlot {slot!r} (not in tongflow.abi.json)",
                    "use a nodeSlot defined in the ABI",
                )
            )
            continue
        if slot in methods:
            problems.append(
                _scan_error(
                    manifest_path,
                    f"nodeSlot {slot!r} is declared more than once",
                    "keep one entry per slot",
                )
            )
            continue
        if not isinstance(method, str) or not method.strip():
            problems.append(
                _scan_error(
                    manifest_path,
                    f"{where} ({slot}) is missing method",
                    "name the exported handler that implements the slot",
                )
            )
            continue
        cfg: dict[str, object] = {"methodName": method.strip()}
        models = item.get("models")
        if models is not None:
            if (
                not isinstance(models, list)
                or not models
                or not all(isinstance(m, str) and m for m in models)
            ):
                problems.append(
                    _scan_error(
                        manifest_path,
                        f"{where} ({slot}) models must be a non-empty list of strings",
                        "list model ids, default first, or drop the key",
                    )
                )
            else:
                cfg["models"] = list(models)
        methods[slot] = cfg

    if not methods:
        if not problems:
            problems.append(
                _scan_error(
                    manifest_path,
                    "no valid slots declared",
                    'declare at least one {"nodeSlot": ..., "method": ...}',
                )
            )
        return None, problems

    return (
        {
            "localSubdir": plugin_dir.name,
            "methodsByNodeSlot": methods,
            "entryFile": entry_rel.as_posix(),
            "needsDeploy": False,
            "runtime": RUNTIME_BROWSER,
        },
        problems,
    )


def scan(plugins_root: Path, abi_path: Path) -> dict[str, object]:
    abi = load_abi(abi_path)
    valid = abi.node_slots

    node_plugin_map: dict[str, list[str]] = {}
    plugins: dict[str, dict[str, object]] = {}
    errors: list[dict[str, str]] = []
    # slot -> plugin ids that declared `@node_slot(..., default=True)` for it,
    # in directory order. Resolved into the head of nodePluginMap below.
    default_claims: dict[str, list[str]] = {}

    for pdir in _iter_plugin_dirs(plugins_root):
        plugin_id = pdir.name
        runner, runner_error = _detect_runner(pdir)
        if runner_error:
            errors.append({"pluginId": plugin_id, "message": runner_error})
            continue

        if runner == RUNTIME_BROWSER:
            edge_entry, edge_problems = _scan_edge_plugin(pdir, valid)
            for message in edge_problems:
                errors.append({"pluginId": plugin_id, "message": message})
            if edge_entry is None:
                continue
            plugins[plugin_id] = edge_entry
            for slot in edge_entry["methodsByNodeSlot"]:
                node_plugin_map.setdefault(slot, [])
                if plugin_id not in node_plugin_map[slot]:
                    node_plugin_map[slot].append(plugin_id)
            continue

        # Every plugin is spawned the same way: the platform runs the plugin's
        # local entry.py and exchanges JSON. Handlers are discovered by scanning
        # every .py file for module-level @node_slot + SDK annotations.
        methods_by_ident, default_idents, default_problems = (
            _scan_methods_by_slot_in_dir(pdir)
        )
        for message in default_problems:
            errors.append({"pluginId": plugin_id, "message": message})
        # A deploy-first plugin keeps its handlers as methods on a @deploy-marked
        # class in deploy.py — first arg `self`, so the module-level dir scan
        # skips them. Fall back to the backend-neutral deploy parser (it matches
        # tongflow's own @deploy marker, not any backend's class decorator). Such
        # a plugin must be deployed before it can run, recorded as needsDeploy so
        # the platform routes it through its entry.py deploy-then-invoke bridge.
        needs_deploy = False
        if not methods_by_ident and (pdir / "deploy.py").is_file():
            dscan, _derr = parse_deploy_py(pdir / "deploy.py")
            if dscan and dscan.methods_by_slot:
                methods_by_ident = dict(dscan.methods_by_slot)
                default_idents = set(dscan.default_slots)
                for lineno, reason in dscan.default_problems:
                    errors.append(
                        {
                            "pluginId": plugin_id,
                            "message": _scan_error(
                                pdir / "deploy.py",
                                reason,
                                "pass a literal True",
                                line=lineno,
                            ),
                        }
                    )
                needs_deploy = True
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
            if ident in default_idents:
                default_claims.setdefault(slot, []).append(plugin_id)

        if not llm_methods:
            continue

        # Optional per-slot model lists (router-style plugins). Purely additive:
        # plugins that declare no TONGFLOW_SLOT_MODELS are untouched.
        models_by_slot, model_problems = _scan_slot_models_in_dir(pdir)
        for message in model_problems:
            errors.append({"pluginId": plugin_id, "message": message})
        for slot, models in models_by_slot.items():
            if slot not in llm_methods:
                errors.append(
                    {
                        "pluginId": plugin_id,
                        "message": _scan_error(
                            pdir / "entry.py",
                            f"{SLOT_MODELS_CONST} declares models for slot {slot!r} "
                            "but the plugin has no @node_slot handler for it",
                            "remove the entry or add the matching handler",
                        ),
                    }
                )
                continue
            llm_methods[slot]["models"] = models

        # Optional per-slot advanced parameters (plugin-specific run knobs the
        # node exposes under a collapsed section). Additive like models.
        params_by_slot, param_problems = _scan_slot_params_in_dir(pdir)
        for message in param_problems:
            errors.append({"pluginId": plugin_id, "message": message})
        for slot, params in params_by_slot.items():
            if slot not in llm_methods:
                errors.append(
                    {
                        "pluginId": plugin_id,
                        "message": _scan_error(
                            pdir / "entry.py",
                            f"{SLOT_PARAMS_CONST} declares params for slot {slot!r} "
                            "but the plugin has no @node_slot handler for it",
                            "remove the entry or add the matching handler",
                        ),
                    }
                )
                continue
            llm_methods[slot]["params"] = params

        # Optional live model catalog (router-style plugins): the canvas fetches
        # it client-side and extends the per-slot dropdown beyond the shortlist.
        model_catalog, catalog_problems = _scan_model_catalog_in_dir(pdir)
        for message in catalog_problems:
            errors.append({"pluginId": plugin_id, "message": message})
        if model_catalog is not None:
            for slot in list(model_catalog["slots"]):
                if slot in llm_methods:
                    continue
                errors.append(
                    {
                        "pluginId": plugin_id,
                        "message": _scan_error(
                            pdir / "entry.py",
                            f"{MODEL_CATALOG_CONST} filters slot {slot!r} but the "
                            "plugin has no @node_slot handler for it",
                            "remove the entry or add the matching handler",
                        ),
                    }
                )
                del model_catalog["slots"][slot]
            if not model_catalog["slots"]:
                model_catalog = None

        # Optional default-implementation claims. The module constant is the
        # portable form (never executed, so any SDK version imports it);
        # `@node_slot(..., default=True)` is equivalent but needs tongflow>=0.2.15
        # in whatever runtime imports the plugin.
        claimed_slots, claim_problems = _scan_default_slots_in_dir(pdir)
        for message in claim_problems:
            errors.append({"pluginId": plugin_id, "message": message})
        for slot in claimed_slots:
            if slot not in llm_methods:
                errors.append(
                    {
                        "pluginId": plugin_id,
                        "message": _scan_error(
                            pdir / "entry.py",
                            f"{DEFAULT_SLOTS_CONST} claims slot {slot!r} but the "
                            "plugin has no @node_slot handler for it",
                            "remove the entry or add the matching handler",
                        ),
                    }
                )
                continue
            if plugin_id not in default_claims.setdefault(slot, []):
                default_claims[slot].append(plugin_id)

        plugins[plugin_id] = {
            "localSubdir": plugin_id,
            "methodsByNodeSlot": llm_methods,
            "entryFile": "entry.py",
            "needsDeploy": needs_deploy,
            "runtime": RUNTIME_PYTHON,
        }
        if model_catalog is not None:
            plugins[plugin_id]["modelCatalog"] = model_catalog

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

    # The head of nodePluginMap[slot] is the slot's default implementation: what
    # a freshly added node preselects and what the picker lists first. Without a
    # `default=True` claim it stays the first plugin in directory order.
    for slot, claimants in default_claims.items():
        winner = claimants[0]
        if len(claimants) > 1:
            errors.append(
                {
                    "pluginId": winner,
                    "message": (
                        f"{plugins_root}:1: slot {slot!r} is claimed as default by "
                        f"{', '.join(claimants)}; using {winner}; "
                        "fix: keep @node_slot(..., default=True) on one plugin per slot"
                    ),
                }
            )
        ids = node_plugin_map.get(slot, [])
        node_plugin_map[slot] = [winner, *(x for x in ids if x != winner)]

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


def add_scan_arguments(ap: argparse.ArgumentParser) -> None:
    ap.add_argument(
        "--root",
        type=Path,
        default=Path("plugins"),
        help="Directory that contains one folder per plugin (default: ./plugins).",
    )
    ap.add_argument(
        "--abi",
        type=Path,
        default=None,
        help=(
            "Path to tongflow.abi.json (default: $TONGFLOW_ABI_PATH, then the "
            "ABI bundled with this SDK, then ./packages/tongflow/abi/tongflow.abi.json)."
        ),
    )


def run_scan(ns: argparse.Namespace) -> int:
    # Imported lazily: the engine module tree is optional for pure scanning.
    from .engine.abi_schema import resolve_abi_path

    root = ns.root if ns.root.is_absolute() else (Path.cwd() / ns.root).resolve()
    if ns.abi is None:
        abi = resolve_abi_path()
    else:
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


def main(argv: "list[str] | None" = None) -> int:
    ap = argparse.ArgumentParser(
        prog="python -m tongflow scan",
        description="Scan Tongflow local plugins/ and print registry JSON (stdout).",
    )
    add_scan_arguments(ap)
    return run_scan(ap.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
