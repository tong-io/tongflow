# Openflow Modal plugins (local `plugins/`)

Each **plugin id** is a directory name under this folder. Build `pnpm plugins:sync` runs
`python3 -m tongflow` to scan `deploy.py` / `download.py` and write
`config/plugins.registry.json`.

## Conventions

- `download.py` — `def download():` (run: `modal run download.py::download`)
- `deploy.py` — `APP_NAME = "..."`, optional `TONGFLOW_NODE_SLOTS = ("nodeSlot1", ...)` (must match
  `nodeSlot` values in `config/tongflow.abi.json`), and a Modal `class Inference` with
  `inference(self, task)` (or re-export from e.g. `entry.py`).

## Python package (`tongflow`)

Published on PyPI: `pip install tongflow` (pin e.g. `tongflow==0.0.1` in Modal `pip_install` / `uv_pip_install` in `impl.py`).

For local work without PyPI, use the repo copy: add `plugins/tongflow` to `PYTHONPATH` or `pip install -e ./plugins/tongflow`.

- `from tongflow.slots import node_slot` — optional decorator (tooling / Openflow scan)
- `python3 -m tongflow --root plugins --abi config/tongflow.abi.json` — print scan JSON (requires `tongflow` importable, see above)

## ABI

`config/tongflow.abi.json` is generated from `config/features.default.json` via
`pnpm abi:generate` (or `node scripts/generate-tongflow-abi.mjs`).
