# TongFlow for Claude Code

A media studio inside Claude Code: Claude plans a project as plain folders, and makes every image / voice / music / video / 3D asset by running a saved TongFlow workflow that sits next to its outputs.

```
/plugin marketplace add tong-io/tongflow
/plugin install tongflow@tongflow
```

Then ask for what you want to make — "make a 30-second product ad for …" — or load the method first with `/tongflow:tongflow-studio`.

What the plugin adds:

- **the `tongflow_*` tools**, from the [`tongflow-studio`](../../packages/tongflow-studio) MCP server (started with `npx`; see its README for requirements, configuration and where plugin API keys go);
- **the Studio page**: ask Claude for it ("open the studio") and it gives a local link — folder tree, previews, the workflow canvas, runs, and the Plugins & keys dialog where you paste API keys.
- **the `tongflow-studio` skill**: the working method — one workflow per asset, outputs beside it, a composition at every folder level, and a billing question before every paid run.

Projects live under `~/.tongflow/studio/projects/` (set `TONGFLOW_STUDIO_ROOT` to move them). Paid runs — an API key or GPU time on your Modal account — never start on their own: the studio refuses one until the call says you agreed, and Claude is told to ask you first, every time.

The skill folder is a copy of [`packages/dsh-tongflow/skills`](../../packages/dsh-tongflow/skills), written by `node scripts/sync-claude-plugin.mjs`; edit the source, not the copy.
