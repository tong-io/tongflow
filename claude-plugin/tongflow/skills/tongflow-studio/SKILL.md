---
name: tongflow-studio
description: "How to work in a TongFlow studio project — design the folder structure for what the user wants to make, keep every AI-generated asset next to the workflow file that made it, and drive generation through saved TongFlow workflows. Whenever the user is producing media in a studio project (images, voices, music, video, 3D, cuts) or asks how the studio, its folders or workflows work."
---

# TongFlow studio — how to work

**Language:** answer in the user's language and write project text files (notes, scripts, prompts you keep on disk) in that language unless asked otherwise. File and folder names: short, lowercase, ASCII, hyphen- or underscore-separated (`characters/mei/`, `ep01/sh010/`). Prompts sent to image/video models: English unless the plugin needs otherwise.

Three layers, never mixed up:

1. **You (the agent)** create: the plan, the folder structure, briefs, scripts, character notes, prompts, decisions, review notes. Those are plain files you write with the ordinary file tools.
2. **TongFlow** generates deterministically: every image, voice, music, video or 3D asset is produced by **running a saved workflow file** (`<name>.tongflow.json`). There is no "just generate an image" tool — the workflow file is reproducible, editable on the canvas by the user, and re-runnable.
3. **The project folder** is the single source of truth. Nothing lives only in chat — see **The second rule** below.

## The one rule

**Every AI-generated asset comes from a workflow file that sits next to its outputs.**

```
characters/mei/
  mei.md                    ← what you wrote about her (look, personality, voice)
  mei_ref.tongflow.json     ← the workflow that renders her reference sheet
  mei_ref.01.png            ← run 1
  mei_ref.02.png            ← run 2 (a run never overwrites; fix the workflow, run again)
  mei_ref.runs.json         ← provenance of every run (inputs, plugins, note, time)
```

One workflow per asset, named after the asset, in the folder where the asset belongs. Multi-output runs are `mei_ref.03.image.png` + `mei_ref.03.caption.txt`. To use a result elsewhere, reference the file by path.

## The second rule

**Everything you write lands in a file. Chat is where you point at it, not where you deliver it.**

Write the file first, then say a line or two in chat: what you wrote, where, and anything you had to guess. "Wrote `ep01/sh010/prompt.md` — 6s, one push-in, she stands and crosses to the door. I guessed the jacket stays wet from sh005; say if not."

Do not paste the work into chat instead of saving it. Do not paste it into chat *and* save it either — the user then reviews the chat copy, their edits go to a file nobody re-reads, and the two drift apart. One copy, on disk.

A file is what the user opens, edits by hand, keeps, and what the next session reads. A chat message is none of those.

**Goes in a file**: the plan and the folder README; briefs; character, style and world notes; scripts and dialogue; every prompt you write — in the workflow node itself, or in a text file the node includes with `{{path}}`; shot lists and beat sheets; research summaries; review findings and which take you picked and why; decisions and the reasoning behind them; anything longer than a few lines; anything you would otherwise have to say twice.

**Stays in chat**: the billing question and the user's answer; a question you need answered before you can continue; short status ("run 3 done, kept `.02`"); and the pointer to what you just wrote.

When the user asks to see something you wrote, give them the path — they can open it. Paste it inline only if they ask for it inline.

## The third rule

**One workflow is one step. Every folder above them holds the composition of everything beneath it.**

Split until a workflow has a single executable node, and give each its own place:

```
ep01/
  ep01_all.tongflow.json        ← every leaf under ep01, composed
  sh010/
    sh010_all.tongflow.json     ← ref + i2v + lipsync, composed
    ref.tongflow.json           ← ONE node: text → image
    ref.02.png
    i2v.tongflow.json           ← ONE node: ./ref.02.png → video
    i2v.01.mp4
    lipsync.tongflow.json       ← ONE node: ./i2v.01.mp4 + ./line.wav → video
    lipsync.01.mp4
  sh020/
    sh020_all.tongflow.json
    …
```

Why one node per file: a step you can re-run alone is a step you can fix alone. Re-running `i2v` does not regenerate the keyframe you already approved and paid for, its outputs number independently (`i2v.01.mp4`, `i2v.02.mp4`), and the user can open exactly the step they want to argue with on the canvas.

Why the composition at every level: `tongflow_workflow_compose({ folder })` gathers the **leaves** beneath a folder — not the child folders' own `_all` files — and turns each file reference into a real edge, across folders as well as within one. So `sh010_all` is that shot end to end, `ep01_all` is the whole episode, and running either regenerates everything underneath in one go. The leaves stay exactly as they were; a composition is a view, never a replacement.

Compose a level once its leaves exist and were reviewed, and compose it again after the leaves change — a stale `_all` is worse than none, because it looks whole.

## There is no template — design the structure

The three rules fix the *granularity* — one workflow per step, outputs beside their workflow, a composition at every level above — not the folder names. What the folders are called and how deep they go is yours to design: `ep01/sh010/` for a drama, `spots/30s/shot-03/` for an ad, `tracks/02/stem-bass/` for an album.

The project starts as an empty folder with `project.json` (title, brief). Read the brief (`tongflow_project_status`), then:

1. **Research first.** If you know little about the genre, format, deliverable or style, use the host's web search / fetch tools when available: how is this kind of thing normally produced, what are the stages, what does a professional deliverable look like. Keep a short `research.md` with what mattered and links. Skip when the user gave the material or asked you not to browse.
2. **Propose the folder structure** to the user as a plan: which folders, what goes in each, in what order things get made, and which assets need a workflow. Adapt it to the work — a manga drama, a product ad, a music video, an audiobook and a game asset pack all look different. **Divide finely, all the way down to one step per workflow** (see **The third rule**); prefer numbers or ids that sort (`ep01/sh010`) when order matters, and let the depth follow the work's own shape — episode, scene, shot, step.
3. **Write it down**: create the folders, and put a `README.md` (or a `plan.md` at the root) that explains the structure and the steps — the user and later sessions read that, not the chat.
4. **Fill it stage by stage**: text you author → workflow files → runs → review → the next stage builds on the results by path.

The user may change any of it by hand at any time (rename, move, delete) and can **add their own files** to any folder (the Studio uploads into `uploads/` by default) — reference photos, voice samples, logos, scripts. Use them by path like any other file (`./ref.png`, `uploads/logo.png`). Always call `tongflow_project_status` before assuming what exists.

## Workflows follow TongFlow's grammar — nothing else

Read `tongflow_node_catalog` before writing any workflow; it opens with the grammar and lists every node type by category with the exact ABI facts (wires, config, outputs, installed plugins). In short:

- **Six node categories** — `add/` (canvas input widgets; never in your workflows), `modality/` (data nodes: text · image · video · audio · file · model · link, one asset each), and four kinds of executables: `transfer/` 1 → 1, `compose/` N → 1, `decompose/` 1 → N, `batch/` N → 1 grouping. Each executable is one **ABI slot** implemented by plugins.
- **Shape**: modality node(s) → executable → its output modality node(s) (created automatically) → next executable. Choose the executable whose slot *is* the transformation (image + audio → talking video is `compose/` lip-sync, not a chain of transfers). Wire only into handles the catalog lists; set only config fields it lists; `tongflow_node_describe(type)` for enums / ranges.
- **Batch vs collect**: a wire marked `batch` runs once per upstream item; `collect` gathers all incoming edges into one run. Never copy nodes to fake a loop.
- The patch tool validates every step against the ABI: an `ok:false` step means the grammar rejected it — read the error, fix, don't retry blindly. `tongflow_workflow_validate` before running.

## Referencing files inside workflows

- Image / audio / video inputs of a data node: `data:{fileKeys:['./mei_ref.02.png']}` — relative to the workflow file (`./`, `../`) or to the project root (`characters/mei/mei_ref.02.png`). URLs pass through.
- Text you keep in files can be **included** in a prompt: `texts:['{{../style.md}} {{./mei.md}} full-body character sheet, front and side view, plain background']` — `{{path}}` is replaced by the file's content at run time. Write shared style / character descriptions once and include them where needed instead of re-describing from memory.
- Compose the whole prompt in ONE text node; never chain text-combining nodes for that.

## Method references — load only what the step needs

These sit next to this file; resolve them against the skill's base directory.

- `references/prompt-layers.md` — before writing any non-trivial prompt: the seven layers, what belongs in the prompt text versus the node config versus a wired file, reference scope, and the checks to run before spending a paid run.
- `references/shot-contract.md` — any video shot: `open_state` / beats / `close_state`, the camera start-path-end contract, dialogue and audio, and continuity across shots.
- `references/failure-codes.md` — a result came back wrong: locate the responsible layer and make the smallest fix, instead of adding negative words.
- `references/iteration.md` — before running the same asset again: what counts as an iteration, changing one variable, when to stop rewriting the prompt, and how to record the choice.

`references/SOURCES.md` records where this method comes from and what it does not license.

## The loop for any media

1. `tongflow_project_status` — see what exists; `tongflow_node_catalog` — node types and installed plugins.
2. `tongflow_workflow_new({ path: '<folder>/<asset>' })` — one file per asset → `tongflow_workflow_patch` (write the concrete prompt / file refs / params into the nodes — `references/prompt-layers.md`, and `references/shot-contract.md` for a video shot; `copy_from` another workflow of the project when the shape is the same) → `tongflow_workflow_read` (verify wires + validation).
3. **Billing checkpoint — every paid run, every time.** A run that uses a paid plugin costs the user money (a paid API key, or GPU seconds on their Modal account — a Modal plugin also deploys on first run). `tongflow_workflow_run` without `user_confirmed` refuses and returns `needs_confirmation`: which plugins, how each is billed, whether its API keys are set, which models it offers, and installed alternatives. Put that to the user in plain words ("这一步用 Gemini 生图,按次计费到你的 GEMINI_API_KEY;也可以换 X;要用哪个模型?现在跑吗?"), wait for their yes, then call again with `user_confirmed: true`. Ask before **each** paid run — a yes for the last run does not cover the next one, and never set the flag on your own. Runs that use only local plugins are free and need no confirmation. When you plan a batch (e.g. ten shots), say so and get one clear yes for that batch, then run them one after another.
4. `tongflow_workflow_run` — foreground for a single image, `run_in_background` for video/batches; keep working meanwhile.
5. Review: `tongflow_look` (images, video contact sheets) and `tongflow_perceive` (video/audio/image understanding, transcripts). If this session's model does not take images, `tongflow_look` describes the asset through a describe slot instead of showing it, and says so — a look is never silently blind. Understanding runs a plugin, so it obeys the same billing checkpoint as a run: a billing plugin returns `needs_confirmation` and needs the user's yes before `tongflow_perceive` is called with `user_confirmed: true`; a local one just runs. Write findings into a notes file next to the asset or in a `notes/` folder.
6. **Compose upward when a folder is done.** `tongflow_workflow_compose({ folder })` gathers every leaf workflow **under** that folder, at any depth, and writes ONE `<folder>_all.tongflow.json` beside them: file references to another part's output become real edges — across folders as well as within one — every stage stays an output named after its part (`sh010_all.01.i2v.mp4`), and the parts are untouched. Do it for the shot, then the scene, then the episode, so each level has the whole picture of what is beneath it (see **The third rule**). Tell the user where it is (in the Studio it opens on the canvas); a run of it regenerates everything under that folder in one go (a paid run like any other).
7. If it is off, name the failure and the layer that owns it (`references/failure-codes.md`), change one thing, and run again — the next number lands beside the old one. Two versions with no improvement on the same failure means the problem is not in the prompt (`references/iteration.md`). When it is right, use that file's path downstream (e.g. `./mei_ref.02.png` as the reference for a shot). Tell the user which number you picked and why.

Rules of thumb:
- Patch incrementally; never rebuild a workflow from scratch; never invent node ids. Read the patch result: `ok:false` steps must be fixed before running.
- Prefer self-contained workflows (values written into nodes) so opening the file on the canvas shows exactly what made that output. A level-0 data node without data becomes an input you supply per run — use it only for genuinely per-run values.
- A workflow is **one executable node** and the data nodes feeding it. A chain (fusion → upscale, i2v → lip-sync, concat → merge music) is that many workflows in one folder, joined by their output files, not one workflow with several steps.
- Text you author (script, dialogue, prompts) goes into files, then into workflows by inclusion or as node text — text generation nodes are only for mechanical bulk transforms.
- Before running, make sure the plugin for each node is installed (`tongflow_plugins_list`, `tongflow_plugins_install`) and its API keys are set — in the Studio's Plugins & keys dialog, or wherever this host's instructions say the studio keeps them. Never ask the user to paste a key into chat.
- **Read the plugin's own README before guessing.** `tongflow_plugins_list` gives each installed plugin's `readme` path; the file says which models it offers and which is the default, what each env key changes, the resolutions and aspect ratios it accepts, and its quirks. Read it when choosing between plugins for a slot, when setting a model or param you have not used, and when a run fails for a reason the error does not explain — it is local, authoritative, and costs nothing. Do not guess a model name; do not go looking on the web for something the installed plugin already documents.
- **Never recommend an install from the id alone.** The `official` list is the plugins that are *not* installed, so there is no local README for them — each carries its `repo`. Before telling the user to install one, fetch its README (`<repo>/blob/main/README.md`, raw at `raw.githubusercontent.com/<org>/<id>/main/README.md`) and say what it actually does, which slots it fills and which keys it needs. An installed plugin's `repo` is worth opening only for its issues, or to check whether the clone has fallen behind — its files are already on disk.
- If the user edited a workflow on the canvas, `tongflow_workflow_read` it again before patching.
- Never delete generated files on your own; the user decides what to keep.
