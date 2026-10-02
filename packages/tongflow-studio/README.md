# tongflow-studio

**TongFlow's media studio for agents — served as an MCP server.**

Three layers, never mixed up:

| Layer | Owns |
|---|---|
| **the host** | sessions, the model, the chat (Claude Code, dsh, any MCP client) |
| **the agent** | creativity: the plan, the folder structure, briefs, scripts, prompts, review notes — plain files |
| **TongFlow** | deterministic generation: every image / voice / music / video / 3D asset is produced by **running a saved workflow file** (`<name>.tongflow.json`) through the TongFlow engine and its plugins |

There is deliberately no "generate an image" tool and no project template. The agent proposes a folder structure for what the user wants to make, and for every asset creates a workflow file where that asset belongs, runs it, reviews the result, and builds the next stage on it.

## Use it

Any MCP client:

```json
{
    "mcpServers": {
        "tongflow": { "command": "npx", "args": ["-y", "tongflow-studio", "mcp"] }
    }
}
```

Claude Code, with the working method as a skill:

```
/plugin marketplace add tong-io/tongflow
/plugin install tongflow@tongflow
```

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the [`dsh-tongflow`](../dsh-tongflow) plugin, which adds the Studio panel and the embedded canvas.

Requirements: Node ≥ 22.19, **Python ≥ 3.10** on `PATH`, `git`, and `ffmpeg` for video contact sheets. On first use the studio creates a venv with the `tongflow` SDK and shallow-clones every official TongFlow plugin (the live list from [`config/official-plugins.json`](../../config/official-plugins.json)). Keys and Modal deploys are only needed when something runs.

## Configuration

Environment variables of the server process:

| Variable | Meaning | Default |
|---|---|---|
| `TONGFLOW_STUDIO_ROOT` | data root: `projects/`, `plugins/`, `venv/`, `env.json` | `~/.tongflow/studio` |
| `TONGFLOW_STUDIO_PYTHON` | Python ≥ 3.10 used to create the venv | auto-detected |
| `TONGFLOW_STUDIO_SDK_SPEC` | pip requirement of the TongFlow SDK | the pinned `tongflow==X.Y.Z` |
| `TONGFLOW_STUDIO_AUTO_INSTALL` | `0` to not clone the official plugins at start | on |
| `TONGFLOW_STUDIO_LOCALE` | language of new projects | `en` |

**Plugin API keys** (`GEMINI_API_KEY`, Modal tokens, …) are read from the server's environment and from `<root>/env.json` (`{ "KEY": "value" }`, the file wins). You set them; the agent is told never to ask for a key in chat.

To share one studio between hosts, point them at the same root — e.g. `TONGFLOW_STUDIO_ROOT=~/.dsh/tongflow` reuses a dsh studio's projects, plugins and venv.

## The project (a plain folder)

```
<root>/projects/<id>/
  project.json                     title, brief, locale — the only fixed file
  README.md                        the agent's plan
  characters/mei/
    mei.md                         what the agent wrote about her
    mei_ref.tongflow.json          the workflow that renders her reference sheet
    mei_ref.01.png                 run 1
    mei_ref.02.png                 run 2 (a run never overwrites)
    mei_ref.runs.json              provenance of every run
```

**The one rule:** every AI-generated asset comes from a workflow file that sits next to its outputs.

## Tools

| | |
|---|---|
| Projects | `tongflow_project_create` · `_open` · `_list` · `_status` |
| Workflows | `tongflow_workflow_new` · `_patch` · `_read` · `_list` · `_validate` · `_compose` · `tongflow_node_catalog` · `tongflow_node_describe` |
| Runs | `tongflow_workflow_run` · `tongflow_run_status` |
| Review | `tongflow_look` (an image, or a video's contact sheet, shown to the model) · `tongflow_perceive` (describe / transcribe through a TongFlow plugin) |
| Plugins | `tongflow_plugins_list` · `_install` · `_uninstall` |

**Billing checkpoint:** a run that uses a paid plugin (an API key, or GPU time on your Modal account) does not start without `user_confirmed: true` — it answers `needs_confirmation` with the plugins, how each is billed and the alternatives, and the agent is instructed to ask you every time.

## As a library

A host with its own tool registry or web server imports the pieces instead of spawning the server:

```ts
import { allTools, createRouteHandler, Studio, StudioApi, studioConfig } from "tongflow-studio";

const studio = new Studio({ config: studioConfig({ studioRoot }) });
await studio.init();
const env = { studio, api: new StudioApi(studio) };

allTools(env);                                        // ToolSpec[]: name, description, parameters, execute(args, call)
createRouteHandler({ ...env, prefix: "/tongflow" });  // (req, res) => Promise<void> for node:http
```

A `ToolCall` carries what the host has — `signal`, and optionally `sessionId`, `cwd`, `showImage`, `takesImages`, `startBackground`, `progress`; the tools degrade without the rest. `packages/dsh-tongflow/src/tools.ts` is a complete adapter.

## Development

```sh
pnpm --filter tongflow-studio typecheck
pnpm --filter tongflow-studio test
pnpm --filter tongflow-studio build      # dist/
node packages/tongflow-studio/dist/cli.js mcp
```

Publishing: push the tag `studio-npm-vX.Y.Z` matching `package.json` ([`npm-publish.yml`](../../.github/workflows/npm-publish.yml)), then bump the pin in [`claude-plugin/tongflow/.mcp.json`](../../claude-plugin/tongflow/.mcp.json) — a test fails while the two disagree. The studio skill is written once in [`packages/dsh-tongflow/skills`](../dsh-tongflow/skills); `node scripts/sync-claude-plugin.mjs` copies it into the Claude Code plugin.
