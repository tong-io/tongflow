# Design

## Layers

```
dsh (harness) ── tools / jobs / skills / webServer / attachments
      │
      ▼
dsh-tongflow host (Node) — the adapter           dsh-tongflow client (browser)
  index.ts ─ Studio + routes on dsh's webServer    Studio overlay (sidebar 🎬)
  tools.ts ─ ToolSpec → defineTool; a call gets    tree · preview / editor · runs drawer
             the session, attachments, jobs, llm   CanvasPane = tongflow/canvas
  activation.ts ─ studio sessions only             talks to /tongflow/p/:pid/api/*
  skills/ ─ the working method (markdown)
      │
      ▼
tongflow-studio (host-neutral, inlined into lib/index.js at build)
  Studio ─ config, paths, python venv
  StudioApi ─ projects, tree, workflows, outputs, runs, plugins
  tools/ ─ tongflow_* as ToolSpec (name, parameters, execute(args, call))
  http/ ─ /tongflow/* as one node:http handler (JSON, SSE, Range)
  engine/ ─ python -m tongflow engine (NDJSON) → ingest → numbered outputs + runs log
  mcp/ ─ the same tools as an MCP server (`tongflow-studio mcp`), for hosts without a plugin API
      │
      ▼
TongFlow SDK (PyPI) + plugins (~/.dsh/tongflow/plugins), each in the engine's shared venv
```

Paths below (`engine/…`, `project/…`) are relative to [`packages/tongflow-studio/src`](../../tongflow-studio/src).

## Invariants

- The project directory is the source of truth and has **no fixed layout**: `project.json` (title, brief) is the only known file; the agent designs the rest per project and the user may reorganize by hand. Tools hydrate a headless `createFlowStore` from a workflow file, apply a change, re-export, write back. The canvas loads and saves the same file (autosave ticker). No session-level canvas state.
- Media generation = run a workflow file. Canvas "run node" is wrapped into a one-node inline workflow (`engine/single-node.ts`) so it goes through the same engine.
- **Outputs live next to their workflow**: `<stem>.<no>[.<output>].<ext>` in the workflow's directory (one number per run, never overwritten), text outputs as `.txt`, provenance appended to `<stem>.runs.json` (`project/outputs.ts`, `engine/ingest.ts`). The tree nests those files under the workflow row.
- File references are paths: `./x` / `../x` are anchored at the workflow file, bare keys at the project root (with a fallback to the workflow dir), URLs pass through (`project/refs.ts`). `{{path}}` inside any text is replaced by that text file's content at run time. The canvas receives a copy with dir-relative refs rewritten to root keys (`canvasView`) because it serves files by project key.
- **Billing checkpoint**: `StudioApi.paidPlugins(project, workflow)` classifies each plugin a workflow's executable nodes use as `modal` (registry `needsDeploy`), `api` (a required env key) or `local`, and returns the paid ones with billing note, key status, models and alternatives. The agent run tool refuses without `user_confirmed` (asked every paid run, nothing persisted); the Studio run drawer shows the same notice with "Confirm & run". Canvas single-node runs are user-initiated with the plugin/model visible on the node and are not gated.
- **Compose** (`project/compose.ts`): parts are copied with fresh ids; a data node whose file ref parses as `<stem>.NN…` of another part in the same folder is fed by that part's terminal producing node(s) instead (edge + a terminal tap so the stage stays an output); parts are topologically ordered by those refs; `meta.outputLabels` maps `output_<id8>` → part stem and `ingest` uses it for file names.
- Registrations are Cordis effects; the plugin unloads cleanly.

## Run pipeline

`StudioApi.startRun` → `RunManager.start` (queue, concurrency) → `executeRun`: bind inputs (paths → absolute, `{{path}}` → text), resolve embedded refs, spawn `python -m tongflow engine` with `inline_outputs:false`, `out_dir=<project>/.runs/<runId>`, `file_key_base=<project>`; NDJSON events → `RunEvent`s (SSE for the UI, `readOutput` for dsh jobs, canvas frames for the compat API) → `ingestOutputs` → files renamed next to the workflow + `<stem>.runs.json` record.

## Client bundle

CJS closure factory (`window.__ModuleLoader__.load({id, factory})`), one file, platform modules external, everything else inlined; `use-intl` / `@xyflow/react` / `zustand` deduplicated to one copy (`import.meta.resolve`); CSS injected as `<style data-plugin="dsh-tongflow">`; `@sparkjsdev/spark` external (3D node preview degrades).

## Not in scope (yet)

- dsh attachments accept images only; video/audio reach the model via `tongflow_perceive` and contact sheets.
- No `conversation.chat.node` progress card yet — runs show in the Studio's inspector and dsh's job list.
