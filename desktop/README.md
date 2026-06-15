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
pnpm build                    # produces .next/standalone
```

No plugins are bundled in any build — the app ships with none and the user
installs them on demand via the in-app plugin manager.

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

## Release (GitHub Actions)

Releases are built and published automatically by
[`.github/workflows/desktop-release.yml`](../.github/workflows/desktop-release.yml).
To cut one:

1. Bump `version` in `desktop/package.json` (e.g. `0.1.0`).
2. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.

The workflow builds on three runners — macOS arm64 (`macos-14`), macOS x64
(`macos-13`), and Windows x64 — fetches the matching runtimes, and has
`electron-builder` publish the `dmg` / `nsis` artifacts plus the auto-update
feeds to the GitHub Release `v<version>`. Builds are unsigned by default; add
`CSC_LINK` / `CSC_KEY_PASSWORD` (+ Apple notarization secrets) to sign.

## Notes

- Native modules (`better-sqlite3`, `sharp`) ship as node-ABI prebuilds inside
  the Next standalone bundle and run under the bundled Node binary — no
  `electron-rebuild` needed.
- Auto-update uses `electron-updater`; configure the `publish` feed in
  `electron-builder.yml`.
