# TongFlow for Claude Code

A media studio inside Claude Code: Claude plans a project as plain folders, and makes every image / voice / music / video / 3D asset by running a saved TongFlow workflow that sits next to its outputs.

```
/plugin marketplace add tong-io/tongflow
/plugin install tongflow@tongflow
```

Then ask for what you want to make — "make a 30-second product ad for …" — or load the method first with `/tongflow:tongflow-studio`.

What the plugin adds:

- **the `tongflow_*` tools**, from the [`tongflow-studio`](../../packages/tongflow-studio) MCP server (started with `npx`; see its README for requirements, configuration and where plugin API keys go);
- **the TongFlow panel** (`/tongflow`, or it opens by itself the first time Claude uses a TongFlow tool): your projects and the folder tree of the one in work, kept current as Claude makes things. Every file and workflow in it is a link.
- **the Studio page**: what those links open — the file previewed, or the workflow on the canvas — with the folder tree, the runs and the Plugins & keys dialog where you paste API keys. Claude Code cannot draw a web page inside its own window, so the canvas and the previews live in this local page and the panel is the part that is plain text. In the Claude desktop app, choose **Open in app** and the page sits in the Browser pane beside the chat. You can also just ask Claude to "open the studio".
- **the `tongflow-studio` skill**: the working method — one workflow per asset, outputs beside it, a composition at every folder level, and a billing question before every paid run.
- **a billing dialog**: a run or a perceive call that carries `user_confirmed: true` is always put to Claude Code's permission prompt, even when the tool is allow-listed — so the yes is yours, not the model's. A status line shows the workflow while it runs.

Projects live under `~/.tongflow/studio/projects/` (set `TONGFLOW_STUDIO_ROOT` to move them). Paid runs — an API key or GPU time on your Modal account — never start without your yes.

The panel, the dialog and the status line are one function-hooks mod, [`hooks/register.tsx`](hooks/register.tsx); it reads the studio over the same local routes the Studio page uses. Function hooks are early access in Claude Code and their API moves between releases, so the mod stays small. Check it with `claude plugin validate claude-plugin/tongflow` and `claude plugin test claude-plugin/tongflow`.

The skill folder is a copy of [`packages/dsh-tongflow/skills`](../../packages/dsh-tongflow/skills), written by `node scripts/sync-claude-plugin.mjs`; edit the source, not the copy.
