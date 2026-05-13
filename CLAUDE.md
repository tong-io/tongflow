# CLAUDE.md

**TongFlow:** multi-modal AIGC studio. Authoritative setup: [`README.md`](README.md).

**Editing:** Follow existing patterns; keep PRs narrowly scoped; no secrets in git. **Comments in code:** English only.

## Directory conventions

- **`src/lib/`** = business code, organized by domain subdirectory (`abi/`, `task/`, `workflow/`, `plugin-executor/`, `plugins/`, `modal/`, `file/`, `upload/`, `schema/`, `api/`). May hold state, perform I/O, or be server-only.
- **`src/utils/`** = pure helpers only (no I/O, no business concepts, ≤ a few small files). Anything stateful or domain-aware belongs in `src/lib/`.
- **Server-only files** are suffixed `.server.ts` and live under a domain subdir (e.g. [`src/lib/plugins/plugins-registry.server.ts`](src/lib/plugins/plugins-registry.server.ts)).
- **Node component subdirectories** under [`src/components/workspace/nodes/`](src/components/workspace/nodes/):
  - `add/` — create new assets (upload / manual input)
  - `modality/` — display existing assets, one per modality (image/video/audio/text/file/model)
  - `transfer/` — 1→1 transforms
  - `compose/` — N→1 combinations
  - `decompose/` — 1→N splits
  - `batch/` — N→1 groupings (e.g. arrange)
  - `base/` — shared shells and pickers (`abi-node-shell`, `base-node-shell`, `abi-handles`, etc.)

## Cross-layer changes (node inputs, new fields, fixing mismatches between UI and runtime)

- **ABI first:** [`config/tongflow.abi.json`](config/tongflow.abi.json) is the contract. Prefer explicit `required` when the product guarantees a value (e.g. duration from a picker).
- **Regenerate TS types:** `pnpm gen:abi` → [`src/generated/abi/index.ts`](src/generated/abi/index.ts).
- **Python SDK:** Keep [`sdk/tongflow/models/`](sdk/tongflow/models/) in sync (e.g. [`sdk/tongflow/gen_models.py`](sdk/tongflow/gen_models.py) or hand-edits). Bump [`sdk/pyproject.toml`](sdk/pyproject.toml) and **publish** with `pnpm tongflow:publish` before Modal plugins depend on the new types or conventions.
- **Next.js executable nodes:** ABI first → `pnpm gen:abi`. Implement UI with **`useAbiForm`**, **`useAbiExecution`** (via [`AbiNodeShell`](src/components/workspace/nodes/base/abi-node-shell.tsx)), and **`<AbiHandles>`** (auto-renders `in:<field>` / `out:<field>` handles). The exporter ([`exporter.ts`](src/lib/workflow/exporter.ts)) and connection validator both read directly from the ABI mount registry ([`node-registry.ts`](src/lib/abi/node-registry.ts)) + [`resolveSpec`](src/lib/abi/resolve.ts); a node's `sourceSpec` is the single source of truth — never hand-maintain `bindings` / `paramMappings` / `getPrompts` in node files.
- **Add / Modality nodes** (`add/*`, `modality/*`): not ABI-driven. Each renders its own fixed `<Handle id="in:<modality>">` / `<Handle id="out:<modality>">` directly inside `<BaseNodeShell>`.
- **Modal plugins:** Bump the installed `tongflow` version to the release above, then implement reading and mapping of new fields (plugin defaults are not a substitute for the ABI). Sync any vendored ABI copy with the main repo.

**Plugins directory** ([`plugins/`](plugins/)) is gitignored and populated at runtime — see [`docs/plugins.md`](docs/plugins.md).
