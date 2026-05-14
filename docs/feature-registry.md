# Feature registry

For open-source deployments: feature metadata is **derived from the ABI + plugin scanner** — no hand-maintained JSON list. An optional JSON file can override values locally or per deployment.

## How the default list is produced

The server-side default bundle is built at startup by [`feature-registry.server.ts`](../src/lib/plugins/feature-registry.server.ts) from:

- The ABI's `nodeSlot` list ([`config/tongflow.abi.json`](../config/tongflow.abi.json) → [`TONGFLOW_ABI_NODES`](../src/lib/schema/tongflow-abi.ts))
- The plugin scanner result ([`plugins-registry.server.ts`](../src/lib/plugins/plugins-registry.server.ts), which exposes `runner` and `nodePluginMap`)

For each `nodeSlot`, the first plugin in `nodePluginMap` is used; `type` / `function` are decided by `runner`:

| runner | type | function |
|--------|------|----------|
| `llm` | `llm` | plugin id |
| `modal` | `modal` | `runners.modal.appName ?? plugin id` |

The client-side import [`feature-registry.ts`](../src/lib/plugins/feature-registry.ts) only carries a single placeholder fallback (`type=function=unregistered`); the real list is delivered via [`GET /api/feature/list`](../src/app/api/feature/list/route.ts) and hydrated into the client store.

## Optional overrides

| Source | Description |
|--------|-------------|
| `.tongflow/features.local.json` | **Optional** local or deployment override (already ignored in [`.gitignore`](../.gitignore)) |
| Env var `FEATURES_CONFIG_PATH` | **Optional** path to an additional JSON, merged after `features.local.json` |

Merge order: **ABI/plugin-derived default bundle → `.tongflow/features.local.json` (if present) → `FEATURES_CONFIG_PATH` (if present)**.
The `features` array is merged by `name` (later writes override earlier); `aliases.canonical` / `aliases.labelLookup` collisions are resolved the same way.

The file schema is validated by the zod schema in [`feature-registry-schema.ts`](../src/lib/plugins/feature-registry-schema.ts); there is no standalone JSON Schema file.

## JSON structure (override file)

- **`features`**: each entry has `name`, `type`, `function`.
- **`aliases.canonical`**: legacy canvas names or aliases → the canonical `name` in the registry (affects task resolution and lookup).
- **`aliases.labelLookup`**: maps **display-only labels** (used by node dropdowns and similar) to another registry entry; does not change task routing.

## Three steps to add an AI capability

1. **Add a `nodeSlot` in the ABI** ([`config/tongflow.abi.json`](../config/tongflow.abi.json)) and run `pnpm gen:abi`.
2. **Implement the corresponding plugin**: drop a Modal / LLM plugin under `plugins/` and let the scanner register it (see [`docs/plugins.md`](plugins.md)); task execution flows through [`executePlugin`](../src/lib/plugin-executor/execute.ts).
3. **To surface the new `name` in a node's dropdown**: update that node's **allowed-feature constant** (e.g. `GEN_TEXT_FEATURES`). Node whitelists are decoupled from the registry to prevent accidentally exposing unimplemented capabilities.

## Client vs server

- The merged list and aliases are delivered by [`GET /api/feature/list`](../src/app/api/feature/list/route.ts) (implementation in [`feature-registry.server.ts`](../src/lib/plugins/feature-registry.server.ts), which uses `node:fs` and is **server-only**).
- Browser code should import from [`feature-registry.ts`](../src/lib/plugins/feature-registry.ts) (placeholder-only, no `fs`). Before `/api/feature/list` hydrates, **dropdown labels** may fall back to the raw id.
