# dsh-tongflow

**TongFlow as a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) plugin — a media studio inside your agent.**

Three layers, never mixed up:

| Layer | Owns |
|---|---|
| **dsh** | the harness: sessions, model routing, tools, jobs, web UI |
| **the agent** | creativity: the plan, the folder structure, briefs, scripts, prompts, review notes — plain files |
| **TongFlow** | deterministic generation: every image / voice / music / video / 3D asset is produced by **running a saved workflow file** (`<name>.tongflow.json`) through the TongFlow engine and its plugins |

The studio itself is host-neutral — [`tongflow-studio`](../tongflow-studio) holds the projects, the engine runner and the `tongflow_*` tools, and serves the same tools as an MCP server (and a [Claude Code plugin](../../claude-plugin/tongflow)). This package is the dsh adapter: it adds the Studio panel and the embedded canvas.

There is deliberately no "generate an image" tool and no project template. The agent studies what the user wants to make (with web research when useful), proposes a folder structure, writes it down, and then — for every asset — creates a workflow file where that asset belongs, runs it, reviews the result, and builds the next stage on it. Users open the same `.tongflow.json` on the embedded canvas, tweak it, and re-run; they can also reorganize the folders by hand at any time.

## Install

```sh
npx @deepseek-ai/dsh@next plugin --profile web add dsh-tongflow      # from npm
# or from a tarball:  pnpm --filter dsh-tongflow pack  →  dsh plugin --profile web add ./dsh-tongflow-x.y.z.tgz
npx @deepseek-ai/dsh@next web
```

Requirements: dsh ≥ 0.1.2-rc.1 — the 0.1.2-rc, 0.1.3-alpha, 0.1.5, 0.1.7 and 0.2.0 lines are supported (`engines.dsh`; verified releases are listed in `dsh.compatibility.dshReleases`); 0.1.1-rc and older are not (the client `Runtime` package they build on was removed upstream, so upgrade dsh rather than pinning an old plugin). Because npm only matches a prerelease when a range clause carries its exact `major.minor.patch`, each new dsh prerelease line needs its own clause in `peerDependencies`. From 0.2.0 on dsh checks those ranges itself and **does not load** a plugin whose `@deepseek-ai/dsh-*` peers exclude the running version (unless you grant `dsh plugin allow-version`), so a host on a line newer than the ones listed needs a newer plugin. Also Node ≥ 22.19, **Python ≥ 3.10** on `PATH` (or `pythonPath` in the plugin config), `git`, and `ffmpeg` for video contact sheets. On first use the plugin creates `~/.dsh/tongflow/venv` with the `tongflow` SDK and shallow-clones every official TongFlow plugin into `~/.dsh/tongflow/plugins` (the live list from `config/official-plugins.json`; set `autoInstallOfficial: false` to install by hand), so the canvas offers the same node/plugin catalog as the hosted app. Keys and Modal deploys are only needed when something runs.

Start a session whose **first message begins with `@tongflow`** — that session becomes a studio session: the conversation view turns into the Studio (chat column · the project's folder tree · preview / editor / canvas · a runs drawer, all in the UI language of your browser), and the agent gets the `tongflow_*` tools and skill. Any other session is untouched dsh. In the Studio: create a project (a title and a brief — what you want to make), install TongFlow plugins and paste API keys under **Plugins & keys**, then talk to the agent — or click any file to preview / edit it, click a workflow to open it on the canvas.

### Chat model

Any model dsh can route works. For the agent to *see* generated images (`tongflow_look`) use a vision-capable route, e.g. in `$DSH_HOME/settings.yaml`:

```yaml
llm-pi-ai:
  providers:
    google:
      apiKeyEnv: GEMINI_API_KEY
    my-qwen:                          # a self-hosted Qwen3.8-27B behind vLLM
      apiKeyEnv: QWEN_API_KEY
      api: openai-completions
      baseURL: http://127.0.0.1:8000/v1
      models:
        - id: Qwen/Qwen3.8-27B
          input: [text, image]
```

Video and audio are reviewed through TongFlow's own describe / transcribe slots (`tongflow_perceive`), so they work with any chat model.

## The project (a plain folder)

```
~/.dsh/tongflow/projects/<id>/
  project.json                     title, brief, locale — the only fixed file
  README.md                        the agent's plan: what the folders are, in what order things get made
  …whatever the work needs…        e.g. characters/, ep01/sh010/, music/, export/ — designed per project
```

**The one rule:** every AI-generated asset comes from a workflow file that sits next to its outputs.

```
characters/mei/
  mei.md                    what the agent wrote about her
  mei_ref.tongflow.json     the workflow that renders her reference sheet
  mei_ref.01.png            run 1
  mei_ref.02.png            run 2  (a run never overwrites — fix the workflow, run again)
  mei_ref.runs.json         provenance of every run: inputs, plugins, note, timing
```

- Multi-output runs keep the workflow's output names: `mei_ref.03.image.png` + `mei_ref.03.caption.txt`; text outputs are written as `.txt` too.
- Workflows reference project files by **path**: `./mei_ref.02.png` / `../style/palette.png` (relative to the workflow file) or `characters/mei/mei_ref.02.png` (relative to the project root); URLs pass through.
- Text files can be **included** in prompts: `{{../style.md}} {{./mei.md}} full-body sheet` — expanded at run time, so a shared style note is written once.
- **Compose**: `tongflow_workflow_compose({ folder })` merges the small workflows of a folder (or an explicit list) into one `<folder>_all.tongflow.json` — a data node that references another part's output file (`./ref.01.png`) becomes an edge from that part's producing node, parts are ordered by those dependencies, every stage stays an output labelled after its part (`shot_all.01.i2v.mp4` via `meta.outputLabels`), the parts are untouched.
- The Studio tree nests a workflow's outputs under it; the user may rename / move / delete anything by hand and **upload files** (header button → the selected folder, or drag & drop onto a folder view; default `uploads/`) — the agent re-reads the tree (`tongflow_project_status`) before acting.

### Billing checkpoint

A run that uses a paid plugin spends the user's money — a paid API key, or GPU seconds on their Modal account (a Modal plugin also deploys on first use). So `tongflow_workflow_run` without `user_confirmed: true` does not run: it returns `needs_confirmation` with the plugins involved, how each is billed (`api` / `modal`), whether its API keys are set, the models it offers and installed alternatives. The agent puts that to the user and calls again with `user_confirmed` only after an explicit yes — **for every paid run**; nothing is remembered. Runs that use only local plugins are free and start directly. The Studio's own **Run** drawer shows the same notice and a **Confirm & run** button.

### Workflows follow TongFlow's grammar

`tongflow_node_catalog` opens with the node grammar — `add/` widgets (canvas only), `modality/` data nodes, and the four executable categories `transfer/` (1 → 1), `compose/` (N → 1), `decompose/` (1 → N), `batch/` (N → 1) — then lists every node type by category with its ABI slot, wires (`batch` / `collect` flags), config fields, outputs and installed plugins, all read from the ABI registry. The patch tool (`apply_graph_patch` from the `tongflow` package) validates each step against the same registry, so a workflow the agent saves is one the exporter and the canvas accept. The category table lives in [`tongflow-studio`'s `src/engine/node-categories.ts`](../tongflow-studio/src/engine/node-categories.ts) and a test keeps it in step with `packages/tongflow/src/canvas/node-types.tsx`.

## Agent tools

`tongflow_project_create / _open / _list / _status` · `tongflow_workflow_new / _patch / _read / _list / _validate / _run / _compose` · `tongflow_node_catalog / _describe` · `tongflow_look` (images / video contact sheets, returned as an image block — or described through a slot when the session's model takes no images) · `tongflow_perceive` (video/audio/image understanding via TongFlow slots; billing plugins need `user_confirmed`) · `tongflow_plugins_list / _install / _uninstall` · `tongflow_run_status`. Folder structure and text files are made with dsh's ordinary file tools. Long runs go through dsh background jobs (`run_in_background`).

Skill shipped: `tongflow-studio` (the working method: research → propose a structure → one workflow per asset next to its outputs → run → review → next stage), with four method references under [`skills/references/`](skills/references/) that the agent loads only when the step needs them:

| Reference | Read before |
|---|---|
| `prompt-layers.md` | writing any non-trivial prompt — the seven layers, and what belongs in the prompt text vs. node config vs. a wired reference file |
| `shot-contract.md` | a video shot — open/close state, beat timeline, camera start-path-end, audio, continuity across shots |
| `failure-codes.md` | a result came back wrong — locate the responsible layer, make the smallest fix |
| `iteration.md` | running the same asset again — one variable at a time, and when to stop rewriting the prompt |

Genre knowledge is not packaged; the agent researches or the user installs a skill of their own.

## Permissions and external services

The plugin runs with the dsh process's permissions and needs all of these to work:

- **Files:** reads and writes project folders and `studioRoot` (`<DSH_HOME>/tongflow`: projects, venv, cloned plugins, run data). API keys pasted under **Plugins & keys** are stored in plain text in `studioRoot/env.json` (mode 0600) and handed to plugin processes as environment variables.
- **Commands:** `python` (creates the venv, `pip install`s the `tongflow` SDK and plugin requirements, runs plugin processes), `git` (shallow-clones plugins), `ffmpeg` (video contact sheets). A plugin process runs that plugin's own code.
- **Network:** GitHub (`raw.githubusercontent.com` for the official plugin list, `github.com/tong-io/*` clones), PyPI, and whatever service a plugin calls when a workflow runs — model APIs, or your own Modal account for GPU plugins. Paid runs ask the user first (see *Billing checkpoint*).
- **Runtime dependencies:** `tongflow` (the workflow core, same repo) and `@deepseek-ai/schemastery`.

It is published to npm with the built `lib/`; the GitHub source tree does not contain build output (run `pnpm --filter dsh-tongflow build`).

## HTTP (same origin as dsh)

`/tongflow/projects`, `/tongflow/p/:pid/{tree,status,workflows,workflow[/summary|/outputs|/describe|/patch],runs,files/*}`, `/tongflow/runs/:id[/events|/cancel]`, `/tongflow/plugins`, `/tongflow/env`, `/tongflow/health`, plus the canvas-compat API under `/tongflow/p/:pid/api/*` that `tongflow/canvas` talks to.

## Configuration (cordis row `tongflow`)

| key | default | |
|---|---|---|
| `studioRoot` | `<DSH_HOME>/tongflow` | projects, venv, plugins, data |
| `pythonPath` | auto-detect | Python ≥ 3.10 used to create the venv |
| `sdkSpec` | `tongflow==0.3.0` | pip spec installed into the venv (`-e /path/to/sdk` for development) |
| `pluginOrg` | `https://github.com/tong-io` | where official plugins are cloned from |
| `pluginGitUrls` | `{}` | plugin id → git URL overrides |
| `env` | `{}` | environment for plugin processes (API keys); the Studio's key store (`env.json`) is merged over it |
| `maxConcurrentRuns` | `2` | |
| `httpPrefix` | `/tongflow` | |
| `locale` | `en` | canvas UI locale (`en` / `zh` / `ja` / `ko`) |
| `autoInstallOfficial` | `true` | at start, shallow-clone every official plugin that is missing (a few hundred KB each) so the canvas offers the full catalog; API keys / Modal deploys are only needed when a workflow runs |

## Development

```sh
pnpm install
pnpm --filter dsh-tongflow build          # host lib/index.js + browser lib/client.js
pnpm --filter dsh-tongflow test
npx @deepseek-ai/dsh@next plugin --profile web add ./packages/dsh-tongflow   # link: install for hacking
```

The browser half is a single CJS bundle in dsh's `window.__ModuleLoader__` shape: only dsh's platform modules (react, cordis, slot kits) stay external; `tongflow/canvas`, @xyflow/react, zustand and use-intl are inlined (and deduplicated so React contexts match). See [`docs/design.md`](docs/design.md).

License: AGPL-3.0-only (same as TongFlow).
