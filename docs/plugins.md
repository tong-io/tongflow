# Plugins directory

The `plugins/` directory at the repo root is **gitignored** and is **not** part of the source tree. Plugin packages live there only at runtime.

## How it gets populated

- **Market install**: the UI under `/plugins` (see [src/app/plugins/page.tsx](../src/app/plugins/page.tsx)) downloads plugin packages from the registry into `plugins/<package-name>/` via [src/app/api/plugins/install/route.ts](../src/app/api/plugins/install/route.ts).
- **Local development**: clone a plugin repo into `plugins/<package-name>/` directly. The scanner ([src/lib/plugins/plugins-scanner.server.ts](../src/lib/plugins/plugins-scanner.server.ts), formerly `src/lib/plugins-scanner.server.ts`) picks it up on next start.
- **Manual download**: `plugins/deploy.py` and `plugins/download.py` are shared utility scripts that get fetched alongside packages.

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
