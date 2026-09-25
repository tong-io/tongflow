# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Voice / timbre replacement works** — new official plugin
  `tongflow-modal-seed-vc` (Seed-VC, zero-shot) fills the last empty node in
  the capability matrix. Connect a recording and a short reference clip; the
  recording comes back in the reference's voice. A **Singing mode** under
  Advanced keeps the melody (44.1 kHz) with optional pitch shift.

### Changed

- **`convert_voice` ABI** — inputs are now `audio` + `ref_audio` (both
  assets) instead of `sourceKey` + a preset-voice filename `targetKey`. The
  node drops its placeholder voice list and unfinished upload / record
  buttons; both inputs come in over edges. Python SDK 0.3.4 carries the new
  model.

- **DeepSeek plugin follows V4.1 Flash** — DeepSeek collapsed V4 Flash and its
  experimental vision variant into a single `deepseek-flash` id (1M context,
  native image understanding) on 2026-09-10 and only routes the old ids
  temporarily. The plugin's model picker now lists `deepseek-flash` (default)
  and `deepseek-v4-pro`, maps the retired ids itself so saved workflows keep
  running, and serves the **Image → text** and **Describe image** slots on
  Flash with an **Image detail** knob under Advanced.

## [0.3.5] - 2026-09-10

### Added

- **Advanced parameters on executable nodes** — a plugin declares its
  run-time knobs (sampling steps, CFG / guidance, LoRA strength, thinking
  toggles, reasoning effort, temperature, resolution tiers…) as a pure-literal
  `TONGFLOW_SLOT_PARAMS` table next to its handlers; the node shows them under
  a collapsed **Advanced** section below the plugin / model pickers. Controls:
  `select`, `number`, `integer`, `boolean`, `text`, optionally gated per router
  model. Only values that differ from the declared default are stored on the
  node and sent top-level as `params` (never inside the ABI prompt); the plugin
  reads them through `tongflow.slots.current_params()` and falls back to its
  own defaults for anything untouched. Changed params show the declared
  default beside the label. New `tasks.params` column, `ExecutableNode.params`
  in the workflow export. Scanner version 8, SDK 0.3.3.
- **36 official plugins expose advanced parameters** — text plugins
  (temperature, thinking / reasoning effort), diffusion image plugins (steps,
  CFG, shift, LoRA strength, prompt enhancement), video plugins (MiniMax H3
  steps + PDD fast path, LTX steps / frame rate / control signal, InfiniteTalk
  resolution and guidance, Bernini guidance, Wan-Animate relight, Veo /
  Seedance resolution and audio), music / speech (MiniMax Music steps / CFG /
  top-k, LeVo, IndexTTS emotion strength, OpenAI TTS speed), and utilities
  (Whisper model size, PaddleOCR language, PDF DPI, SAM 3 confidence,
  SAM-Audio rerank / spans / keep-prompt, Scrapling toggles). DeepSeek's
  thinking moved from `<model>-thinking` ids to an Advanced switch (old ids
  still work).

## [0.3.4] - 2026-08-19

### Added

- **CometAPI router plugin** —
  [tongflow-router-cometapi](https://github.com/tong-io/tongflow-router-cometapi):
  one key for 500+ models behind CometAPI's OpenAI-compatible routes, covering
  **19 slots** — `gen_text` / split / combine, image / video / audio
  understanding, image gen/edit/fusion (GPT Image 2, Seedream), text / image(s)
  → video (Sora 2, Veo 3.1, Seedance, Wan, MiniMax H3, HappyHorse, Vidu), video
  edit (Omni), TTS and Whisper transcription.
- **ToAPIs router plugin** —
  [tongflow-router-toapis](https://github.com/tong-io/tongflow-router-toapis):
  one key behind ToAPIs' OpenAI-compatible chat route and unified async image /
  video routes, covering **15 slots** — `gen_text` / split / combine, image
  understanding, image gen/edit/fusion (GPT Image 2, Seedream 5, Gemini Image,
  Flux 2, Grok), text / image(s) / first-last-frame / multimodal refs → video
  (Sora 2, Veo 3.1, Seedance 2, Kling, MiniMax H3, Wan, HappyHorse, Vidu),
  video edit (HappyHorse). Inputs are hosted through ToAPIs' upload routes; the
  model picker follows the key's live model list.
- **Authenticated model catalogs** — `TONGFLOW_MODEL_CATALOG` may set
  `authEnv` (the env key holding a bearer token); the canvas then loads the
  catalog through `GET /api/plugins/model-catalog?pluginId=…`, which injects
  the key from Settings server-side, instead of fetching the URL in the
  browser. Slot rules also accept token lists and `!`-negated tokens. Scanner
  version 7, SDK 0.3.2.
- **Live model catalogs for the per-node model picker** — a plugin may declare
  `TONGFLOW_MODEL_CATALOG` (a public, CORS-enabled catalog URL plus per-slot
  filter rules); the canvas fetches it in the browser (10-minute cache,
  re-checked when the dropdown opens) and appends matching ids after the static
  `TONGFLOW_SLOT_MODELS` shortlist. Scanner version 6, SDK 0.3.1
  (`modelCatalog` on the plugin registry entry), `filterModelCatalog` in
  `tongflow` core.

### Removed

- **Agnes AI plugin** (`tongflow-api-agnes`) — unregistered; the upstream
  gateway is superseded by CometAPI.

## [0.3.3] - 2026-08-19

### Added

- **`dsh-tongflow`** (`packages/dsh-tongflow`) — TongFlow as a DeepSeek Harness
  plugin: a film-crew studio (`~/.dsh/tongflow/projects/<id>`: bible entities
  `CHR_/LOC_/PRP_/STY_`, shot breakdown `EP01_SC003_SH0010`, numbered takes with
  provenance, `tf://` references and `{{tf://…}}` prompt templates), `tongflow_*`
  agent tools where all media generation runs saved `*.tongflow.json` workflows
  through the Python engine, packaged skills (`tongflow-studio`,
  `tongflow-manga-drama` + workflow templates), and a Studio UI in dsh's web
  shell embedding `tongflow/canvas` (canvas-compat API under
  `/tongflow/p/:pid/api/*`). Published as npm `dsh-tongflow` (`dsh-npm-v*` tags).
- **`tongflow` 0.2.0** — canvas-only dependencies moved to optional peer
  dependencies (the core entry now depends only on `zod` / `json-schema-to-ts`);
  the exporter honours `data.inputName` on level-0 data / add nodes so workflow
  inputs get readable names.
- **Krea 2 Turbo text-to-image plugin** (#143) —
  [tongflow-modal-krea2](https://github.com/tong-io/tongflow-modal-krea2)
  (open-weights 12B, 8-step, up to 2K) joins the official GPU plugins.

### Removed

- **LTX and FastWan video plugins** (#138) — `tongflow-modal-ltx` and
  `tongflow-modal-fastwan` are no longer official plugins. The preloaded
  example workflow's image-to-video step now runs on `tongflow-modal-minimax-h3`.
- **In-app workspace agent** — the chat panel that built workflows on the
  canvas (added in 0.3.0, #130) is gone, along with its `/api/agent/chat`
  proxy, generated docs corpus and the `openai` dependency. TongFlow is a
  pure workflow product again; agent-driven building moves to external hosts
  that consume the `tongflow` npm package + Python SDK engine (see `dsh-tongflow`).
  `docs/agent-workflow-manual.md` stays as the reference for such hosts.
- **Skill packages** (`tongflow-package-*`, added in 0.3.2, #140) — the Gen
  Text skill picker, the skills registry / `/api/skills/registry` route and the
  content-package install path are removed; the plugin scanner no longer
  special-cases the prefix (scanner v5). Prompt packs belong to the agent host,
  not to the workflow.

## [0.3.2] - 2026-08-14

### Added

- **Manual edge connections** (#145) — drag a connection between any two node
  handles; the ABI contract is validated live during the drag (modality match,
  single-value handle occupancy, add-node fan-out), so only valid edges can
  land. Nodes display newly connected upstream data immediately, and a
  connection can be dragged from either end.
- **Skill packages** (#140) — `tongflow-package-*` content packages ship
  reusable prompt packs (skills) instead of executable code. The Gen Text node
  gains a skill picker; the selected skill's body is prepended to the prompt
  at execution time. The official
  [tongflow-package-skills](https://github.com/tong-io/tongflow-package-skills)
  starter pack (12 skills) installs like any plugin.
- **IndexTTS-2.5 emotive speech plugin**
  ([tongflow-modal-indextts2](https://github.com/tong-io/tongflow-modal-indextts2))
  — zero-shot voice cloning and emotion-controlled speech from a voice
  reference, adding the "Emotive speech" capability.
- **Local plugin prefix** (#141) — `tongflow-local-*` registers on-device
  engine plugins that run outside Modal, e.g. MiniMax-H3 through the native
  h3.c Metal binary on Apple silicon.
- **Omni-reference in more selections** (#137) — the multi-select smart island
  now offers `refs-gen-video` for multiple videos (≤3), multiple images (≤9),
  and text + single media combos.

### Fixed

- **Official router plugins failed to uninstall with a 400** — the plugin
  installer now accepts the `tongflow-router-*` (and the new local)
  prefixes (#140, #141).

## [0.3.1] - 2026-08-03

### Added

- **Omni-reference video generation** (#135) — new `refs-gen-video` node:
  mix up to 9 reference images, 3 video clips and 3 audio clips (12 files
  max) with a prompt to generate one video. Select any mix of image / video /
  audio nodes and the smart island offers it in one click. Address references
  in the prompt as `<Picture 1>` / `<Video 1>` / `<Audio 1>`.
- **MiniMax-H3 official plugin**
  ([tongflow-modal-minimax-h3](https://github.com/tong-io/tongflow-modal-minimax-h3))
  — self-hosted 33B video generation with **native stereo audio** (dialogue,
  SFX and music in one pass; 24 fps, 768p, ~5–15 s) on Modal via headless
  ComfyUI, using the Comfy-Org optimized weights (~63 GB instead of 498 GB).
  Serves six video slots including the new omni-reference; measured 4 min 17 s
  per 5 s clip on B200 (≈ $0.45).
- **Seedance omni-reference** — the Doubao (ByteDance) plugin implements the
  new `refs-gen-video` slot via Seedance 2.0 multimodal references.
- **Consistent node spacing + one-click auto-layout** (#134) — spawn gaps are
  now uniform across agent builds, manual adds and run-result spawning, and a
  toolbar button tidies the whole canvas into layered columns.

### Changed

- **Python SDK 0.2.21** — generated models for the new `refs-gen-video` slot.
  All official Modal plugins repinned to 0.2.21.

### Fixed

- **Docker image build keeps the agent manual in context** (#132).

## [0.3.0] - 2026-08-02

### Added

- **Workspace agent** (#130) — a collapsible chat panel on the right side of
  the canvas. Describe what you want in natural language (attach images,
  video, audio or documents straight into the chat) and the agent builds the
  workflow **live on the canvas**: nodes appear one by one with the camera
  following, prompts and parameters fill into the node forms, and one Cmd+Z
  undoes an entire agent turn. It edits incrementally ("make the video 10
  seconds") rather than rebuilding, validates every step against the ABI
  (structurally invalid graphs are rejected before they touch the canvas),
  can health-check a workflow and explain why a run failed, and answers
  questions about using TongFlow from the bundled docs. Bring your own
  brain: the agent runs on any installed OpenAI-compatible text plugin
  (OpenRouter, OpenAI, Gemini, DeepSeek, xAI, Doubao, APIMart, Agnes) with a
  two-level plugin → model picker.
- **App Mode** (#124) — present any workflow as a simple form app: inputs on
  top, results below, canvas hidden. Assets fed through add-nodes become
  replaceable inputs, so a finished workflow doubles as a reusable tool.
- **Canvas undo/redo** (#125) — Cmd+Z / Cmd+Shift+Z plus toolbar buttons,
  with field-level coalescing so a burst of typing is one undo step.
- **Settings overhaul & first-run onboarding** (#118) — settings are now
  human-readable cards with a guided first-run banner. Connecting services
  is a dedicated flow per provider: Modal (with one-shot paste that splits
  both tokens automatically, #119), Hugging Face (#120), and every provider
  API key (#121).
- **Clear, actionable task failures** (#122, #123, #126) — failures now carry
  stable error codes with localized messages and support links; upstream
  Modal/deployer error bodies are preserved in the failure details; a
  missing API key opens a guided dialog that deep-links to the right
  settings field.

### Changed

- **Python SDK 0.2.20** (#127) — direct-stream terminal callback so
  browser-direct streaming runs report their terminal state reliably, plus
  per-call model passthrough. All official Modal plugins repinned to 0.2.20.

### Fixed

- **Completed tasks replay instead of re-running** (#128) — reconnecting to
  a finished task's wait stream now replays the stored terminal state; a
  finished slot can no longer be accidentally re-executed.
- **Undo history stays intact across mount-time defaults** (#129) —
  programmatic default writes in six more node types no longer pollute the
  undo stack.

## [0.2.3] - 2026-07-28

### Fixed

- **One-click execution now handles dynamic split counts end-to-end** (#116) —
  a split's runtime item count drives downstream batch nodes: one plugin call
  per item (`batchField` fan-out in the engine), outputs collected in batch
  order. Previously only the first item was processed, silently.
- **Intermediate data nodes are pure channels in one-click runs** — consumers
  bind straight to the producer's output, so stale edit-time values of
  materialized nodes no longer leak into execution. Re-save workflows exported
  before this version to pick up the new bindings.
- **Loud failure instead of silent data loss** — a single-value input that
  receives multiple upstream values now fails the node with a clear message.

## [0.2.2] - 2026-07-25

### Added

- **DeepSeek plugin** (`tongflow-api-deepseek`) — DeepSeek V4 as a text
  provider for `gen-text` / `combine-text` / `split-text`, with a per-node
  **model dropdown** offering `deepseek-v4-flash` / `deepseek-v4-pro` each
  with thinking on/off (four choices).
- **Streaming "thinking" bubble** — when a plugin streams its reasoning
  (DeepSeek thinking mode), it now appears live in an auto-scrolling bubble
  anchored beside the node while it runs, separate from the status label and
  non-occluding. Backed by `progress(..., thinking=True)` in the SDK.
- **SenseNova-Vision plugin** (`tongflow-modal-sensenova-vision`) — SenseTime's
  unified vision model: image understanding / visual QA, detection & OCR
  structured text, full-scene surface normals, salient-object matting, and a
  human-pose overlay (an alternative implementation of those slots).
- **Open-vocabulary sound separation** (`separate-sound` node) — describe any
  sound in words ("dog barking") and split the audio into that sound and
  everything else.

### Changed

- **Cloud plugin execution path** (Python SDK **tongflow 0.2.7 → 0.2.17**) — a
  new single-container cloud execution surface so plugins can run in the
  user's own Modal without a per-call venv + subprocess:
  - `serve_slot` / `run_and_report` — single-slot execution and a background
    single-node runner that reports back over an HTTP callback;
  - `serve_stream` / `serve_stream_from_spec` — single-container streaming
    slot execution, including a browser-direct stream entry;
  - self-reported progress (and streamed reasoning) over an HTTP sink, so
    remote plugins drive the node status and thinking bubble;
  - an **injectable workflow invoker** that skips the venv + subprocess hop;
  - **default-slot claims** (`TONGFLOW_DEFAULT_SLOTS`, `@node_slot(default=True)`)
    so a plugin can declare the default implementation for a slot while still
    importing under older, already-deployed runtimes.

### Fixed

- SDK `HttpStore` now sends a User-Agent (works around a Cloudflare 403) and
  emits a stable event id in `serve_stream` (tongflow 0.2.13).

## [0.2.1] - 2026-07-12

### Added

- **Meta Sapiens2 human suite** (`tongflow-modal-sapiens2`) — five new ABI
  slots with canvas nodes and smart-island actions, backed by the Sapiens2-1B
  checkpoints on one Modal L40S (bf16, batched):
  - **Pose detection** (`image-pose`) — 308-keypoint whole-body skeleton
    (body, hands, face) on a clean black background;
  - **Body-part segmentation** (`image-body-seg`) — 29-class human parsing
    as a pure class-color map;
  - **Surface normals** (`image-normal`) — per-pixel normal map, background
    masked;
  - **Human matting** (`image-matting`) — straight-alpha transparent PNG;
  - additionally the existing **Image → 3D** slot gains a Sapiens2 pointmap
    implementation (colored human point cloud GLB).
- **Video motion capture** (`video-gen-model`) — monocular video → animated
  3D human GLB on Meta's MHR character (Momentum Human Rig, Apache-2.0),
  playable directly in the model node and importable into Blender as a
  skinned armature. Two competing implementations of the same node slot:
  - **tongflow-modal-sam-3d-body** — per-frame MHR regression (learned
    prior; body + hands, experimental face/jaw channels driving 72 sparse
    glTF morph targets);
  - **tongflow-modal-sapiens2** — geometric engine (308-keypoint pose +
    pointmap 3D lift, One-Euro smoothing, rest-pose hold for out-of-frame
    body parts).
- **Model node: animation playback** — models carrying animation clips now
  auto-play (30 fps cap, pauses off-viewport and in background tabs) with a
  play/pause control in the node preview and the fullscreen viewer.

### Changed

- **Model node initial framing** — the camera now homes straight onto the
  model's front (glTF +z convention) and maximizes the model in the frame
  (aspect-aware fit); fixed a centering bug that framed tall/offset models
  poorly and mixer leaks that kept animating after unmount.
- Python SDK **tongflow 0.2.6** — generated models and `NodeSlots` for the
  five new ABI slots.

## [0.2.0] - 2026-07-06

### Changed

- **The desktop app is now a lightweight cloud shell.** Installers are a
  ~10 MB [Pake](https://github.com/tw93/Pake) (Tauri) wrapper that loads
  the cloud studio at [app.tongflow.com](https://app.tongflow.com) — sign
  in with Google / GitHub / Apple / WeChat and create; plugins and
  execution are managed in the cloud. Release artifacts are now
  `TongFlow-mac-universal.dmg` (one build for Apple Silicon + Intel) and
  `TongFlow-win-x64.msi`. The previous Electron app (≤ v0.1.13), which
  bundled a local Next.js server, SQLite database, and Python plugin
  runtime (~200 MB), is no longer shipped — that fully local, account-free
  experience lives on via self-hosting (`pnpm start:prod` or Docker).
  Existing local installs keep working; no update is pushed to them.

### Added

- **Meta SAM suite** — four new official Modal GPU plugins (all require a
  Hugging Face token for the gated checkpoints):
  - **tongflow-modal-sam3** — text-guided matting: cut every instance of a
    described concept out of an image, or track it through a video;
  - **tongflow-modal-sam-audio** — text-prompted sound separation: noise
    reduction, vocal isolation, and free-text stem extraction (first
    official plugins for the noise-reduction and track-separation slots);
  - **tongflow-modal-sam-3d-objects** — single image → 3D Gaussian splat;
  - **tongflow-modal-sam-3d-body** — single image → full-body human mesh.
- **ACE-Step 1.5 music suite** — six new ABI slots with canvas nodes and
  smart-island actions, all served by the reworked `tongflow-modal-ace-step`
  plugin:
  - **Music repaint** (`music-repaint`) — regenerate a chosen time range;
  - **Music cover** (`music-cover`) — restyle a song via caption and/or
    reference track;
  - **Stem extraction** (`music-extract`) — isolate one of 12 stems
    (vocals, drums, bass, guitar, …);
  - **Add track** (`music-lego`) — generate a new stem over a mix;
  - **Complete arrangement** (`music-complete`) — fill in missing tracks;
  - **Music brief** (`music-brief`) — one-sentence idea → lyrics, style
    tags, BPM, key, and duration (runs on the 5 Hz LM).
  The plugin also implements **audio-describe** (music understanding via
  the LM) and exposes a per-node **model dropdown** for the DiT
  (`xl-sft` default / `xl-base` / `xl-turbo`).

### Changed

- **ACE-Step default model upgraded** from `xl-base` to **`xl-sft`** (the
  official best-quality variant); the upstream repo revision is now pinned.
- Python SDK **0.2.3** / **0.2.5** published: generated models for the six
  new music slots, a `current_model()` side channel so router-style model
  selection reaches Modal-backed plugins, and (0.2.5) the merged source of
  0.2.3 + 0.2.4's `HttpStore`.

## [0.1.13] - 2026-07-04

### Added

- **Audio understanding** — new `audio-describe` ABI slot and canvas node:
  select an audio node and hit **Describe** on the smart island to get a
  natural-language description of the clip (genre, mood, instruments,
  vocals, events), with an optional custom prompt. Implemented by four
  official plugins: **Gemini** (native audio in `generateContent`),
  **OpenAI** (`gpt-audio` via `input_audio` part), **Agnes**
  (`agnes-2.0-flash`, `input_audio` part), and **Gemma 4** (GPU, existing
  multimodal pipeline). Requires `tongflow==0.2.2`.
- **Reference audio for music generation** — the music node (`gen-music`)
  gains an optional `ref_audio` input handle: connect an audio node to
  condition the song on a reference track. ACE-Step uses it for
  style-transfer conditioning (`reference_audio`); LeVo uses it as the
  melody prompt (`melody_wavs`, first 10 s). Requires `tongflow==0.2.1`
  (published) and redeployed `tongflow-modal-ace-step` /
  `tongflow-modal-levo` plugins.

### Changed

- **Uploads: 50 MB file-size limit removed** — large media files can now be
  added to the canvas directly.
- Python SDK **0.2.1** / **0.2.2** published to PyPI (generated models and
  `NodeSlots` for the two new capabilities above). Official plugin repos
  created for **LeVo**, **Bernini**, **FastWan**, and **SenseNova-U1**.

### Fixed

- **Upload failures are no longer silent** — per-file upload errors are
  surfaced instead of quietly dropping the file.
- **Node prompt boxes no longer stretch endlessly** — long input now stops
  at a fixed height and scrolls (the auto-growing textarea previously
  expanded the whole node with no scrollbar).
- **Gemini plugin worked around Google's model retirement** — the default
  `gemini-2.0-flash` now 404s upstream; bumped to `gemini-2.5-flash` so the
  plugin works out of the box again.

## [0.1.12] - 2026-07-04

### Added

- **Agnes AI official plugin** (`tongflow-api-agnes`) — one API key covers
  **12 slots** via the OpenAI-compatible [Agnes AI](https://agnes-ai.com)
  gateway: text generation / splitting / combining and image understanding
  (`agnes-2.0-flash`, 512K context), image generation / editing
  (`agnes-image-2.1-flash` / `2.0-flash`, per-node model picker), multi-image
  fusion (`agnes-image-2.0-flash`), and async text / image / multi-image /
  first-last-frame → video (`agnes-video-v2.0`, up to ~18 s per clip).
- **Desktop auto-update** — the app checks for new releases and updates
  itself via an in-app update button; no more manual installer downloads.
- **Uninstall plugins** — installed plugins can now be removed from the
  plugin manager.
- **Cancel running nodes** — a running node can be cancelled from its
  loading overlay.

### Changed

- **Per-plugin env var cards** — Settings renders each plugin's declared
  environment variables (`tongflow.plugin.json`) as a pre-filled card;
  shared keys are hoisted into a single "Shared" card.
- **In-app dialogs** — native `confirm`/`alert` popups replaced with
  in-app dialogs.

## [0.1.11] - 2026-07-03

### Fixed

- **Plugin installs behind corporate proxies / private CAs** — installing a
  plugin no longer fails with `git failed: unable to verify the first
  certificate` when the network uses a TLS-inspection proxy or the plugin
  repo is served under a privately-trusted CA. The desktop app now launches
  its bundled Node server with `--use-system-ca`, so the OS trust store
  (macOS Keychain / Windows certificate store) is honored in addition to
  Node's built-in CA list.

## [0.1.10] - 2026-07-02

### Added

- **Per-node model picker for router-style plugins** — a plugin can now declare
  per-slot model lists (a `TONGFLOW_SLOT_MODELS` constant, discovered by the
  scanner without importing plugin code). The node shows a **Model** dropdown
  next to the plugin selector, and the selection travels top-level — like
  `pluginId` — through task creation, the `tasks` table, the plugin envelope,
  and workflow export. Fully opt-in: plugins that declare no models are
  unchanged, and new plugins degrade gracefully to their default model on
  older runtimes.
- **APIMart official plugin** (`tongflow-api-apimart`) — one API key routes
  **46 models across 7 slots** via the [APIMart](https://apimart.ai) gateway:
  image generation / editing (Z-Image-Turbo, Seedream 4.5 / 4.0 / 5.0-Lite,
  Nano Banana Pro / 2 / classic, GPT-Image 1 / 2, Imagen 4.0, Qwen Image 2.0,
  Wan2.7, Grok Imagine), text / image → video (Kling v3 / 3.0-Turbo / 2.6,
  VEO3.1 fast / quality / lite, Sora 2 / Pro, Seedance 2.0 / 1.5-Pro), text
  generation (GPT-5.x, Claude, Gemini, DeepSeek), Whisper transcription, and
  TTS — with the backing model selectable per node.
- **Link node** — link modality asset node plus a link → text transform,
  wired through connection validation and the workflow exporter.
- Registered the **LeVo** official plugin (`tongflow-modal-levo`).

### Changed

- Python SDK **0.2.0** published to PyPI: the plugin scanner emits per-slot
  model lists and the workflow engine forwards the node's model selection to
  plugins.

## [0.1.9] - 2026-06-30

### Added

- **Korean (`ko`) locale** — full UI translation, joining the existing
  English / Chinese / Japanese languages.
- Registered the **Boogu-Image** official plugin (`tongflow-modal-boogu`).

### Fixed

- Execution feedback is now cleared when a node's plugin is not installed,
  instead of leaving a stale error on the node.

## [0.1.8] - 2026-06-28

### Added

- **Doubao Seedance 2.0** official API plugin (`tongflow-api-bytedance`):
  Volcengine Ark video generation covering text → video, image → video,
  first/last-frame video, and image + audio → video.
- **Images → Video** node — free multi-image reference fusion: connect several
  reference images plus a prompt to generate a new video (Seedance multimodal
  reference). Backed by a new `images-gen-video` ABI slot, reachable from the
  smart-island compose menu when 2–9 image nodes (optionally plus one text
  node) are selected.
- **Video editing** node (`video-edit` ABI slot) and the **Bernini-R** unified
  renderer plugin (`tongflow-modal-bernini`).

### Fixed

- Image Fusion: a prompt fed from an upstream text node is now actually used at
  execution. Previously the node displayed the upstream text but refused to run
  with "required input text is empty"; the text handle is now wired into the
  ABI prompt (upstream edge wins, the manual textarea is the fallback).

## [0.1.7] - 2026-06-27

### Changed

- Canvas edges are no longer created by dragging from a handle. Handles set
  `isConnectableStart={false}`, so connections are created only via the
  operation panel (expands/compose). Users can still **reconnect** an existing
  edge's endpoint to another node.

### Added

- Reconnecting an edge endpoint is validated against the ABI contract: the
  upstream modality must match the target handle, single-value (non-array)
  input handles accept only one edge, `add` nodes fan out to a single edge,
  and modality nodes can't feed each other.
- Dropping a dragged edge endpoint on empty canvas prompts to delete the
  connection. The reconnect preview line matches the edge style so it stays
  visible and tracks the cursor.

### Fixed

- Aspect-ratio picker labels no longer overflow their button in English; long
  labels wrap onto multiple lines instead of clipping past the border.

## [0.1.6] - 2026-06-26

### Added

- Image generation nodes gain a **resolution tier** picker (1K / 2K / 4K)
  alongside the aspect-ratio picker. The chosen width/height is the aspect
  ratio's base (1K) dimensions scaled by the tier, persisted directly to the
  existing `width`/`height` ABI fields (no new contract field).

### Fixed

- Desktop release pipeline no longer fails to publish under GitHub's immutable
  releases. Per-arch installers are uploaded to a draft release and the draft
  is published once after all assets are attached, instead of publishing
  immediately and 422-ing on subsequent asset uploads. (Supersedes 0.1.5,
  which never shipped a usable release.)

## [0.1.4] - 2026-06-25

### Fixed

- Plugins no longer crash on a non-UTF-8 system locale (notably Windows
  Simplified-Chinese, whose ANSI code page is GBK / cp936). A spawned Python's
  stdout/stderr defaulted to the system locale, so a plugin printing a
  non-ASCII character — such as the `✓` emitted while downloading model
  weights — raised `UnicodeEncodeError: 'gbk' codec can't encode character`
  and surfaced as "downloading weights failed (exit 1)". Every Python spawn
  site now forces UTF-8 mode (`PYTHONUTF8=1`).

## [0.1.3] - 2026-06-22

### Added

- Official plugin **Unlimited-OCR** (`tongflow-modal-unlimited-ocr`) — Baidu's
  Unlimited-OCR for long-horizon document / PDF → text on the `parse-document`
  slot, a GPU alternative to Docling and PaddleOCR.

## [0.1.2] - 2026-06-20

### Added

- Official plugins **TripoSplat** (single image → 3D Gaussian Splatting) and
  **SCAIL-2** (controlled character animation) are now in the plugin registry.
- The 3D model node renders Gaussian-splat assets (`.splat`, `.ply`, `.spz`,
  `.ksplat`, `.sog`) in-app via SparkJS, with a free-tumble trackball camera and
  on-demand rendering for smooth performance on large splats.

### Fixed

- Plugin `model` (3D) outputs are now persisted to file references and rendered
  on the canvas; previously such outputs were dropped and the node showed
  nothing.

## [0.1.1] - 2026-06-16

### Fixed

- Installed plugins now appear in node pickers without reloading the app, and
  the plugin manager recovers from a directory left behind by an interrupted or
  failed clone instead of treating it as already installed.
- Packaged desktop app: rebuild `better-sqlite3`'s native binary for the bundled
  Node runtime during packaging, fixing `ERR_DLOPEN_FAILED` errors (e.g. "Failed
  to save workflow") when the build machine's Node differs from the bundled one.
- Exclude `.env` files from the packaged app bundle; the desktop app reads all
  configuration from the in-app settings store.

### Changed

- Bundled Node runtime and CI upgraded to Node 24.

## [0.1.0] - 2026-06-16

First public open-source release of TongFlow.

[0.2.0]: https://github.com/tong-io/tongflow/compare/v0.1.13...v0.2.0
[0.1.13]: https://github.com/tong-io/tongflow/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/tong-io/tongflow/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/tong-io/tongflow/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/tong-io/tongflow/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/tong-io/tongflow/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/tong-io/tongflow/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/tong-io/tongflow/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/tong-io/tongflow/compare/v0.1.5...v0.1.6
[0.1.4]: https://github.com/tong-io/tongflow/compare/v0.1.3...v0.1.5
[0.1.3]: https://github.com/tong-io/tongflow/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/tong-io/tongflow/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/tong-io/tongflow/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tong-io/tongflow/releases/tag/v0.1.0
