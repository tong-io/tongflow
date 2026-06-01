# Plugins directory

The `plugins/` directory at the repo root is **gitignored** and is **not** part of the source tree. Plugin packages live there only at runtime.

## How it gets populated

- **Official plugins**: run `pnpm plugins:install` ([scripts/install-official-plugins.mjs](../scripts/install-official-plugins.mjs)) to clone every official plugin into `plugins/<package-name>/`, or `pnpm plugins:install <package-name>` for a single one.
- **Manual / third-party**: clone any plugin repo into `plugins/<package-name>/` directly. The scanner ([src/lib/plugins/plugins-scanner.server.ts](../src/lib/plugins/plugins-scanner.server.ts)) picks it up on next start.
- **Shared helpers**: `plugins/deploy.py` and `plugins/download.py` are shared utility scripts that ship inside each plugin repo.

## Why it's gitignored

Each plugin is an independently versioned Python package published to PyPI as `tongflow-modal-*` / `tongflow-llm-*`. Pinning their source into this repo would conflate release cycles. The TongFlow app treats `plugins/` as a runtime data directory, like `data/uploads/`.

## Expected shape

```
plugins/
├── deploy.py                       # shared helper, downloaded with first install
├── download.py                     # shared helper
├── tongflow-modal-<name>/
│   ├── pyproject.toml
│   ├── deploy.py                   # Modal entry
│   └── ...
└── tongflow-llm-<name>/
    ├── pyproject.toml
    └── ...
```

If `plugins/` is missing or empty, the app falls back to an empty plugin registry — the UI still loads, but execution nodes cannot run.
