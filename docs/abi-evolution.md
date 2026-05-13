# TongFlow ABI file evolution

Source file: `config/tongflow.abi.json`.

## `version` field

- The top-level `version` is an **integer** shared by TypeScript ([`src/lib/schema/tongflow-abi.ts`](../src/lib/schema/tongflow-abi.ts)), the codegen script ([`scripts/gen-abi-types.ts`](../scripts/gen-abi-types.ts)), and Python ([`tongflow/abi.py`](../../tongflow-sdk/tongflow/abi.py)).
- **Minimum supported**: `MIN_SUPPORTED_ABI_VERSION` in TypeScript and Python (currently `1`). Files with `version < 1` fail at load/codegen.

## Compatibility policy

| Change type | Version bump | Rule |
|-------------|--------------|------|
| **Minor / additive** | Increment `version` by 1 (or follow repo convention once documented for v2+) | New optional node slots, new optional JSON Schema properties on inputs/outputs, or relaxed validation. Existing consumers must keep working for supported versions. |
| **Major / breaking** | Larger jump only when agreed (e.g. removing nodes, renaming `nodeSlot` strings, incompatible schema changes) | Requires migrations (DB, saved flows, plugins) and a coordinated release; document in changelog / migration notes. |

Do not rely on `.claude/plan.md` for day-to-day ABI rules; update this file when the policy changes.
