# TongFlow Desktop

An Electron shell that runs the TongFlow Next.js standalone server locally with
a self-contained Node.js runtime and a portable Python environment. Inspired by
ComfyUI Desktop: the installer bundles the runtimes; a venv is materialized in
the user data dir on first launch.

## Architecture

- **Main process** (`src/main.ts`) — ensures user dirs, builds the Python venv
  (via bundled `uv` + `python-build-standalone`), starts the Next server with
  the bundled Node binary, then loads `http://127.0.0.1:<port>`.
- **Server** runs from `resources/app/server.js` (the Next standalone bundle).
  Env vars point it at writable/read-only locations:
  - `TONGFLOW_DATA_DIR` → `<userData>/data` (SQLite + uploads)
  - `TONGFLOW_PLUGINS_DIR` → `<userData>/plugins`
  - `TONGFLOW_RESOURCES_DIR` → `resources/app` (drizzle, config, sdk)
  - `PYTHON` → `<userData>/venv` interpreter
- **Credentials** (API keys, `MODAL_TOKEN_*`) are entered in the in-app
  Settings dialog and stored in `<userData>/data/settings.json`; the server
  merges them into plugin processes at execution time. Nothing is hardcoded.

## Build

From the repo root, first build + seed the web app:

```bash
pnpm install
pnpm plugins:install          # seeds LLM plugins for the bundle
pnpm build                    # produces .next/standalone
```

Then in `desktop/`:

```bash
pnpm install
pnpm fetch-runtimes           # downloads node + uv + python for this target
pnpm dist                     # build:main → assemble → electron-builder
```

Cross-arch on macOS: `TONGFLOW_TARGET_ARCH=x64 pnpm fetch-runtimes` before
`pnpm dist:mac`. Build/sign macOS artifacts on macOS; Windows `nsis` builds on
any host.

### Offline first-run (optional)

`pnpm assemble` builds an offline wheelhouse into `resources/wheels` when `uv`
is on `PATH`. If present, the first-run venv install runs fully offline; if
absent, dependencies install from PyPI on first launch. Set
`TONGFLOW_SKIP_WHEELS=1` to skip.

## Notes

- Native modules (`better-sqlite3`, `sharp`) ship as node-ABI prebuilds inside
  the Next standalone bundle and run under the bundled Node binary — no
  `electron-rebuild` needed.
- Auto-update uses `electron-updater`; configure the `publish` feed in
  `electron-builder.yml`.
