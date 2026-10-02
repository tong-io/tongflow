# CLAUDE.md

**TongFlow:** Modality-First GenAI Platform. Authoritative setup: [`README.md`](README.md).

**Editing:** Follow existing patterns; keep PRs narrowly scoped; no secrets in git. **Comments in code:** English only.

## Directory conventions

- **pnpm workspace:** the Next.js app lives at the repo root (`package.json` name `tongflow-app`, private). Publishable npm packages live under [`packages/`](packages/) — [`packages/tongflow`](packages/tongflow) (npm name **`tongflow`**, framework-free workflow core; a `./canvas` React entry follows), [`packages/tongflow-studio`](packages/tongflow-studio) (npm **`tongflow-studio`**: the host-neutral agent studio — projects, engine runner, `tongflow_*` tool specs, HTTP routes, the Studio browser UI (`src/client`, `StudioShell`) — and its MCP server bin, which also serves that UI as a local web page) and [`packages/dsh-tongflow`](packages/dsh-tongflow) (npm **`dsh-tongflow`**: the dsh adapter over `tongflow-studio`, which it inlines at build; its client wraps `StudioShell` with dsh's chat column). Studio behaviour goes in `tongflow-studio`; a host package only adapts it. The Claude Code plugin lives in [`claude-plugin/tongflow`](claude-plugin/tongflow) (listed by [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)); its skill folder is a generated copy of `packages/dsh-tongflow/skills` (`node scripts/sync-claude-plugin.mjs`, drift-guarded by a test). The app consumes it from source via `tsconfig.json` `paths` (`tongflow` → `packages/tongflow/src/core/index.ts`) + `next.config.ts` `transpilePackages`; publishing uses `dist/` built by `pnpm build:packages`. Root scripts `build:packages` / `test:packages` fan out to every package; CI runs them in the `packages` job.
- **`src/lib/`** = app-side business code, organized by domain subdirectory (`task/`, `plugin-executor/`, `plugins/`, `file/`, `upload/`, `api/`, `runtime/`, `settings/`, `agent/`). The framework-free workflow core (ABI, node registry, connection validation, exporter, layout, canvas constants/types) lives in the `tongflow` package under [`packages/tongflow/src/core/`](packages/tongflow/src/core/) and is imported as `from "tongflow"`. May hold state, perform I/O, or be server-only. (Drizzle DB schema lives separately under [`src/db/`](src/db/), e.g. the `tasks` table in [`src/db/workspace.schema.ts`](src/db/workspace.schema.ts).)
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

- **ABI first:** [`packages/tongflow/abi/tongflow.abi.json`](packages/tongflow/abi/tongflow.abi.json) is the contract. Prefer explicit `required` when the product guarantees a value (e.g. duration from a picker).
- **Regenerate TS types:** `pnpm gen:abi` → [`packages/tongflow/src/core/generated/abi/index.ts`](packages/tongflow/src/core/generated/abi/index.ts).
- **Python SDK:** Keep [`sdk/tongflow/models/`](sdk/tongflow/models/) in sync (e.g. [`sdk/tongflow/gen_models.py`](sdk/tongflow/gen_models.py) or hand-edits). Bump [`sdk/pyproject.toml`](sdk/pyproject.toml) and **publish** with `pnpm tongflow:publish` before Modal plugins depend on the new types or conventions.
- **Next.js executable nodes:** ABI first → `pnpm gen:abi`. Implement UI with **`useAbiForm`**, **`useAbiExecution`** (via [`AbiNodeShell`](src/components/workspace/nodes/base/abi-node-shell.tsx)), and **`<AbiHandles>`** (auto-renders `in:<field>` / `out:<field>` handles). **Register the node type** in the static ABI registry [`node-feature-registry.ts`](packages/tongflow/src/core/abi/node-feature-registry.ts): `NODE_TYPE_TO_ABI_FEATURE[nodeType] = "<slot>"` plus any `sourceSpec` overrides in `NODE_TYPE_SOURCE_SPEC[nodeType]` (handle promotions, `batchOn` / `collectAll` / `configField`). That table is the single source of truth: components never carry a `sourceSpec` prop (`useAbiForm` / `useAbiExecution` / `AbiHandles` look it up by node type via `useNodeAbiSpec`), and the exporter ([`exporter.ts`](packages/tongflow/src/core/workflow/exporter.ts)) + connection validator resolve the same table headlessly, so a workflow exports identically with or without the canvas mounted. Never hand-maintain `bindings` / `paramMappings` / `getPrompts` in node files. A vitest drift guard ([`abi-registry-sync.test.ts`](src/components/workspace/nodes/abi-registry-sync.test.ts)) fails if a component and the table disagree.
- **Add / Modality nodes** (`add/*`, `modality/*`): not ABI-driven. Each renders its own fixed `<Handle id="in:<modality>">` / `<Handle id="out:<modality>">` directly inside `<BaseNodeShell>`.
- **Modal plugins:** Bump every plugin's `pip_install("tongflow==X.Y.Z")` pin to match the just-published SDK version. Plugin slot methods consume the new types directly (see "Plugin authoring rules" below); plugin-internal defaults are not a substitute for an ABI field. The SDK is **backend-neutral** (no `modal` dependency): a Modal plugin marks its handler class `@deploy`, builds its app with `modal.App(Path(__file__).resolve().parent.name)` (no SDK helper), ships a thin `entry.py` bridge (identical across Modal plugins), and declares `modal` in its own `requirements.txt`.

**Plugins directory** ([`plugins/`](plugins/)) is gitignored and populated at runtime — see [`docs/plugins.md`](docs/plugins.md).

## Contract enforcement: compile-time only

**The ABI is enforced at compile time, never at runtime.** Bad shapes crash naturally; we do not run ajv / `model_validate` defensively. Static checking is the entire gate:

- **TypeScript** types generated by `pnpm gen:abi` ([`packages/tongflow/src/core/generated/abi/index.ts`](packages/tongflow/src/core/generated/abi/index.ts)) are consumed by the canvas, prompt builder, and workflow exporter.
- **Python `BaseModel`** classes generated by [`sdk/tongflow/gen_models.py`](sdk/tongflow/gen_models.py) annotate every plugin slot method's `input:` and `-> Output`. `pyright` / `mypy` flag typos and shape mismatches.
- There is **no** server-side ABI validator; the previous `validateSlotInput` / `validateSlotOutput` are deleted. There is **no** runtime validation in the SDK — `@node_slot` deep-`model_construct`s without validating.

**Generated Pydantic model conventions** ([`sdk/tongflow/gen_models.py`](sdk/tongflow/gen_models.py)):
- `class FooInput(BaseModel)` + `model_config = ConfigDict(extra="forbid")` per slot, per direction.
- Required field: `field: T` (no default). Optional: `field: T | None = None`.
- Input `$ref: Asset` → `Asset`. **Output `$ref: <X>Ref` → `Asset`** — plugins emit `bytesBase64`; the server's [`convertAssetOutputsToFileRefs`](src/lib/plugin-executor/convert-output-fileref.ts) post-processes those into `{file_key}` for downstream nodes.
- `Asset` / `*Ref` themselves are hand-maintained BaseModels in [`sdk/tongflow/models/asset.py`](sdk/tongflow/models/asset.py); the generator does not overwrite that file.

**`@node_slot` decorator** ([`sdk/tongflow/slots.py`](sdk/tongflow/slots.py)) is the only chokepoint: it introspects the slot method's first parameter, deep-`model_construct`s the incoming dict into a `BaseModel` instance (recursively for nested `$ref` fields, no validation), and on return `model_dump(mode="json")`s a `BaseModel` back to a dict for the backend. Plugin code never sees or produces a raw `dict`.

## Plugin authoring rules

- **Annotate with the generated types.** `def foo(self, input: FooInput) -> FooOutput`. Access fields with `input.field` (attribute access). Return `FooOutput(success=..., ...)`.
- **No dict shims.** `cast(dict, input)` / `dict(input)` / `d.get("field", default)` are forbidden — they bypass static checking.
- **No `try: from tongflow.models ... except ModuleNotFoundError: TypedDict` fallback.** Plain `from tongflow.models.foo import FooInput` only. Dev environments must `pip install tongflow==<current>` locally.
- **ABI gaps stay out of the ABI.** Fields only one plugin needs (model name, internal mode, output codec) become plugin-internal module-level constants or env vars (e.g. `DEFAULT_AUDIO_FORMAT = "mp3"`, `WHISPER_MODEL = os.environ.get(...)`). Don't invent fields the ABI doesn't expose — pyright will flag the access.
- **Per-run knobs go through `TONGFLOW_SLOT_PARAMS`, not the ABI.** A plugin-specific run-time parameter the user should be able to tweak (steps, CFG, LoRA toggles, sampler) is declared as a pure-literal module constant `TONGFLOW_SLOT_PARAMS = {"<slot>": {"<name>": {"type": "select"|"number"|"integer"|"boolean"|"text", ...}}}` (scanner AST-reads it; see [`docs/plugins.md`](docs/plugins.md)). The node shows them under a collapsed **Advanced** section, sends only non-default values top-level as `params`, and the slot body reads them via `tongflow.slots.current_params().get(name, PLUGIN_DEFAULT)`. The main repo never hard-codes a plugin's parameter table.
- **Pin tongflow.** Every `deploy.py`'s `pip_install("tongflow==X.Y.Z")` must match [`sdk/pyproject.toml`](sdk/pyproject.toml).
- **Default implementation:** a module-level `TONGFLOW_DEFAULT_SLOTS = ["image-gen", ...]` (slot strings) claims those slots' default — the scanner hoists that plugin to the head of `nodePluginMap[slot]`, which is what a newly added node preselects and what the picker lists first. Use the constant, not `@node_slot(..., default=True)`: a constant is never executed, so the plugin still imports under the older SDKs baked into already-deployed runtimes (a deployed cloud executor pins its tongflow at provision time and never rolls forward on its own). At most one installed plugin per slot may claim it (a clash is resolved by directory order and reported in the registry `errors`); unclaimed slots keep the old first-in-directory-order behaviour.
- **Backend-neutral SDK.** The SDK never imports `modal`. A deploy-first plugin marks its `@app.cls` handler class with **`@deploy`** (the scanner detects it by AST via [`parse_deploy.py`](sdk/tongflow/parse_deploy.py)), constructs `app = modal.App(Path(__file__).resolve().parent.name)` directly (the `current_app` helper was removed), ships a thin `entry.py` bridge that lazily imports `modal`, and lists `modal` in `requirements.txt`. Don't reintroduce a `modal` SDK dependency or `current_app`.

## Registering an official plugin

- **Source of truth:** [`config/official-plugins.json`](config/official-plugins.json) is the only file the plugins scanner reads; adding the plugin id there is what actually registers it (the scanner AST-discovers its `@deploy` / `@node_slot`).
- **The READMEs are hand-maintained and silently drift.** Registering a plugin does **not** update the docs. When you add one, also edit **all three** READMEs ([`README.md`](README.md), [`docs/README_ZH.md`](docs/README_ZH.md), [`docs/README_JA.md`](docs/README_JA.md)):
  - the **Official plugins** list (**GPU/CPU plugins** or **API plugins**) — one entry, ordered to match `official-plugins.json`;
  - the **capability matrix** — flip the node from ⬜ to ✅ if this is the first official plugin for that ABI slot (e.g. TripoSplat made `image-gen-model` / "Image → 3D" available).

## Wire / persistence shape

- **Create-task API body:** `{feature, pluginId, prompt, nodeId, workflowId?}`. `pluginId` is top-level, **not** nested in `prompt`. `prompt` carries only ABI business fields. See [`src/app/api/task/create/route.ts`](src/app/api/task/create/route.ts).
- **`tasks` table:** `feature`, `plugin_id`, `prompt` (JSON, business fields only) live in separate columns. Don't reintroduce a `routing.pluginId` envelope inside `prompt`.
- **Workflow exporter:** [`ExecutableNode.pluginId`](packages/tongflow/src/core/workflow/executable-workflow.ts) is a top-level field. Workflow `callApi(node, params)` reads it directly.

## ABI hygiene

- **One canonical knob per concept.** `duration` (seconds, user-facing) — never alongside `num_frames`/`frame_rate`. `text` (single string) — never alongside `texts` for the same handle role.
- **Plugin internals don't belong in ABI inputs.** ABI inputs are the cross-plugin product contract; if a field only makes sense for one plugin, make it a plugin constant.

## Commit / PR checklist

Run before every commit; CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) re-checks lint, typecheck, build, and SDK tests on a clean checkout.

- [ ] **Scope** is narrow; follows existing patterns. Code comments in **English only**. No secrets — only [`.env.example`](.env.example) (placeholders) is tracked; real values stay in gitignored `.env`.
- [ ] **If the ABI changed** ([`packages/tongflow/abi/tongflow.abi.json`](packages/tongflow/abi/tongflow.abi.json)): ran `pnpm gen:abi` and committed [`packages/tongflow/src/core/generated/abi/index.ts`](packages/tongflow/src/core/generated/abi/index.ts). Kept the Python SDK models in sync (see "Cross-layer changes").
- [ ] `pnpm lint:check` passes (Biome, `--error-on-warnings`). Use `pnpm lint` to auto-format.
- [ ] `pnpm typecheck` passes (`tsc --noEmit`).
- [ ] `pnpm build` passes (catches Next.js / server-boundary issues lint misses).
- [ ] **If `sdk/` changed:** `cd sdk && pytest` passes.
- [ ] Branch off `main` (never commit straight to `main`); Conventional Commit message (`feat:`/`fix:`/`chore:`…). PRs are covered by the [CLA](CLA.md).

## Release checklist

Two independently-versioned artifacts: the **PyPI `tongflow` SDK** and the **desktop app**. Release the SDK first whenever plugins depend on new types.

**SDK → PyPI** (publishing convention also in [`sdk/README.md`](sdk/README.md)):

- [ ] Bump the version in **both** [`sdk/pyproject.toml`](sdk/pyproject.toml) **and** [`sdk/tongflow/__init__.py`](sdk/tongflow/__init__.py) (`__version__`) — they **must match**; drift between them is a recurring bug.
- [ ] If ABI/types changed, regenerate models ([`sdk/tongflow/gen_models.py`](sdk/tongflow/gen_models.py)) and confirm `cd sdk && pytest` passes.
- [ ] Publish: `pnpm tongflow:publish` ([`scripts/publish-tongflow-pypi.sh`](scripts/publish-tongflow-pypi.sh) — needs `TWINE_USERNAME=__token__` + `TWINE_PASSWORD` in `.env`; dry-run to TestPyPI with `TONGFLOW_UPLOAD_TESTPYPI=1`).
- [ ] Bump every Modal plugin's `pip_install("tongflow==X.Y.Z")` pin to the just-published version (see "Plugin authoring rules").

**Desktop app + GitHub release:**

The desktop app is a Pake (Tauri) cloud shell for `https://app.tongflow.com` — see [`desktop/README.md`](desktop/README.md). Its version comes from the tag (`--app-version`); there is no desktop package.json.

- [ ] Update [`CHANGELOG.md`](CHANGELOG.md) (Keep a Changelog format) and the app version in [`package.json`](package.json) if it's cut.
- [ ] Tag the release (`git tag vX.Y.Z`); [`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml) builds `TongFlow-mac-universal.dmg` and `TongFlow-win-x64.msi` into a draft GitHub Release and flips it public. Dry-run first via workflow_dispatch (artifacts only, no release) and manually verify OAuth sign-in (especially Google) in the built shell.
- [ ] Add the CHANGELOG entry as the release notes.
- [ ] Note: root `package.json` stays `"private": true` — it is the app, not an npm library; never `npm publish` it.
