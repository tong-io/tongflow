# CLAUDE.md

**TongFlow:** multi-modal AIGC studio. Authoritative setup: [`README.md`](README.md).

**Editing:** Follow existing patterns; keep PRs narrowly scoped; no secrets in git. **Comments in code:** English only.

**Cross-layer changes** (node inputs, new fields, fixing mismatches between UI and runtime):

- **ABI first:** [`config/tongflow.abi.json`](config/tongflow.abi.json) is the contract. Prefer explicit `required` when the product guarantees a value (e.g. duration from a picker).
- **Regenerate TS types:** `pnpm gen:abi` → [`src/generated/abi/index.ts`](src/generated/abi/index.ts).
- **Python SDK:** Keep [`sdk/tongflow/models/`](sdk/tongflow/models/) in sync (e.g. [`sdk/tongflow/gen_models.py`](sdk/tongflow/gen_models.py) or hand-edits). Bump [`sdk/pyproject.toml`](sdk/pyproject.toml) and **publish** with `pnpm tongflow:publish` before Modal plugins depend on the new types or conventions.
- **Next.js nodes:** Update both **`paramMappings`** (workflow export / mapped execution) and **`getPrompts`** (canvas single-node runs merge only the prompt object; `paramMappings` is not auto-applied there).
- **Modal plugins:** Bump the installed `tongflow` version to the release above, then implement reading and mapping of new fields (plugin defaults are not a substitute for the ABI). Sync any vendored ABI copy with the main repo.
