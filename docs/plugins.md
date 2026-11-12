# Writing TongFlow plugins

This is the complete guide to building a TongFlow plugin: what a plugin is, how the
platform invokes one, the directory layout, the SDK contract, and the shape of each
runner. For complete, working code, the [official plugins](developers.md#official-plugins)
are the reference implementations — clone any of them and use it as a template.

If you just want to *install* existing plugins, that same list is in the [developer guide](developers.md#official-plugins). This
document is for plugin **authors**.

---

## 1. What a plugin is

Every runnable node on the TongFlow canvas is backed by a **contract**, not by hard-wired
code. That contract is [`packages/tongflow/abi/tongflow.abi.json`](../packages/tongflow/abi/tongflow.abi.json) — the ABI.
The ABI defines *what capabilities exist* and *what each one's input and output look like*.
Each capability is a typed **node slot**: `gen-text`, `image-gen`, `gen-video`, `transcribe`,
and so on. The ABI describes only the contract — text in, image out, which fields are
required — and says **nothing** about *who* fulfills it or *which model* does the work.

**A plugin is an implementation of one or more node slots.** It is a small Python package
that picks slots from the ABI and supplies the *how*.

Because capability (ABI) and implementation (plugin) are cleanly separated:

- A single slot like `image-gen` can have several competing plugins mounted at once; the user
  switches between them on the node.
- Adding a new model means writing a plugin against an **existing** slot — zero frontend
  changes.
- Only a genuinely **new capability** requires evolving the ABI itself
  (see [§8](#8-evolving-the-abi)).

---

## 2. TongFlow binds to nothing — the plugin decides

This is the most important idea in this document. **TongFlow itself is bound to no provider,
no cloud, no model, no runtime.** It only defines the slot — the contract. *Everything* about
how that contract is fulfilled is decided by the plugin's implementation:

- which platform (any model provider, any hosted service, an API router/gateway, your own
  backend, a serverless GPU cloud, …);
- which API or model;
- and even **where the compute happens** — a remote service, or local hardware on the user's
  own machine.

The official plugins are simply **one implementation each** — enough to give every slot at
least one working backend out of the box. They are examples, not the binding. Anyone can
publish an alternative plugin for the same slot that targets a completely different platform,
and users switch between them on the node. TongFlow never assumes which one you picked.

### How the platform invokes your plugin

The lifecycle is the same for every plugin:

1. **Scan.** The platform scans the plugins directory and reads your Python statically (by AST),
   without importing or running it.
2. **Find handlers by annotation.** It looks for functions carrying the SDK's `@node_slot(...)`
   decorator with a typed input and output annotation — that annotated function *is* a handler.
   No manifest, no registration list; the annotations are the declaration.
3. **Bind to node slots.** Each handler names the ABI node slot it implements, and the platform
   binds it there — so a canvas node knows which plugins can fulfill it.
4. **Execute.** When that node runs, the platform invokes the bound handler, hands it the
   request as a typed input object, and takes back the typed output — exchanging data over a
   simple request/result boundary.

The exact scan rules and the annotations a handler must carry are in
[§5](#5-what-registers-a-handler); the directory and naming conventions in
[§3](#3-directory--naming-conventions).

---

## 3. Directory & naming conventions

A plugin is a directory under `plugins/`; the directory name **is** the plugin id. **There is
no registration manifest** — handlers are never registered or listed anywhere; the scanner
derives everything from the SDK decorator + type annotations in your Python (the slot
bindings — see [§5](#5-what-registers-a-handler)). A plugin *may* additionally ship an optional
`tongflow.plugin.json` that declares the env vars it reads, purely so the Settings dialog can
render them as a pre-filled card (see [§6.1](#61-declaring-environment-variables--tongflowpluginjson));
it plays no part in discovery or execution.

The naming convention the scanner enforces:

- The directory name must be **all lowercase**.
- It must begin with `tongflow-api-…`, `tongflow-modal-…`, or `tongflow-router-…` (aggregator
  plugins routing one key to many third-party models). **The prefix no longer selects an
  execution backend** — every plugin runs the same way (see [§5](#5-what-registers-a-handler)).
  It is now just a **label** shown in the node's plugin picker, a hint about where the work
  tends to run (a local/API adapter vs. hosted compute).
- It must **not** encode hardware (`gpu` / `cpu`) — that's the plugin's own concern, not part
  of the id.

One entry point per plugin, by convention:

- A **self-contained** plugin ships `entry.py` — the file the platform executes.
- A **Modal-backed** plugin ships `deploy.py` (handler class marked `@deploy`), a thin `entry.py`
  bridge (identical across Modal plugins), a `requirements.txt` declaring `modal`, and optionally
  `download.py` (see [§5](#5-what-registers-a-handler)).
- A **`requirements.txt`** lists the plugin's *local* Python dependencies; the platform installs
  them automatically (see [§6](#6-local-dependencies--progress)). Modal plugins use it to declare
  `modal`.

Beyond that, your code can be laid out however you like.

## 4. The SDK contract

The SDK is the contract surface. The platform provides it automatically in the managed venv it
runs your entry in (see [§6](#6-local-dependencies--progress)), so a self-contained plugin just
imports it. A **Modal-backed** plugin additionally pins it in its image build
(`pip_install("tongflow==X.Y.Z")`) so the remote side has it too — match
[`sdk/pyproject.toml`](../sdk/pyproject.toml).

### Generated types

For every slot the ABI generates a `*Input` and `*Output` Pydantic model, plus a slot
constant:

- `from tongflow.models.gen_text import GenTextInput, GenTextOutput`
- `from tongflow.node_slots import NodeSlots` → `NodeSlots.GEN_TEXT` is the string `"gen-text"`

Model naming follows the slot: slot `transcribe-timestamp` →
`tongflow.models.transcribe_timestamp` → `TranscribeTimestampInput` / `TranscribeTimestampOutput`.
Each model is `ConfigDict(extra="forbid")`; required fields have no default, optional fields
default to `None`. **Every `*Output` carries `success: bool`** (and an optional `error: str`).

These types are the single source of truth. The contract is enforced by **static checking
only** — annotate your handlers with the generated types and run pyright/mypy. There is no
runtime ABI validation; bad shapes simply raise in Python.

### The `@node_slot` decorator

`@node_slot(NodeSlots.X)` does two things
([`sdk/tongflow/slots.py`](../sdk/tongflow/slots.py)):

1. **Marks** the function so the scanner binds it to slot `X`. You can pass multiple slots,
   or stack the decorator, to serve several slots from one function.
2. **Marshals types** at the I/O boundary: the raw `dict` coming in is deep-`model_construct`ed
   into your `*Input` (recursively, no validation), so your code can dot-access
   `input.audio.bytesBase64`, `input.text`, etc. On return, a `*Output` BaseModel is
   `model_dump(mode="json")`ed back to a dict.

So inside the handler you only ever touch typed objects — never a raw dict.

### Claiming a slot's default implementation

Most slots have several implementations. The one a node preselects when it lands on
the canvas — and the one listed first in the node's plugin picker — is the head of
`nodePluginMap[slot]`. Claim it with a module-level constant, next to your handlers:

```python
TONGFLOW_DEFAULT_SLOTS = ["image-gen", "image-edit"]
```

- Slot **strings** (as in the ABI), not `NodeSlots` idents — same convention as
  `TONGFLOW_SLOT_MODELS`.
- Every claimed slot must have a `@node_slot` handler in the same plugin, else the
  scanner reports it.
- **One claim per slot.** If two installed plugins claim the same slot, the scanner
  keeps the first in directory order and reports the clash in the registry `errors`.
- Slots nobody claims — or whose claimant is not installed — fall back to the first
  plugin in directory order, exactly as before.
- Users are never locked in: the picker still lists every implementation, and a node
  that already has a plugin selected keeps it.

Why a constant and not a decorator argument: the scanner reads it statically, and a
constant is never *executed*, so a plugin that declares it still imports cleanly
under **any** SDK version — including older ones already baked into deployed
runtimes. `@node_slot(NodeSlots.IMAGE_GEN, default=True)` is accepted as an
equivalent claim, but it evaluates at import time and therefore requires
`tongflow>=0.2.15` wherever the plugin is imported (including the local
`modal deploy` that builds a Modal plugin's image). Prefer the constant.

### Per-node model picker (and a live catalog)

A router-style plugin — one key in front of many third-party models — gives each
node a model dropdown by declaring a module-level constant next to its handlers:

```python
TONGFLOW_SLOT_MODELS = {
    "gen-text": ["gemini-3.5-flash", "gpt-5.5"],   # first entry = default
    "image-gen": ["gpt-image-2"],
}
```

Pure literal only (the scanner reads it by AST, never imports the module); slot
strings, not `NodeSlots` idents; every listed slot needs a `@node_slot` handler. The
chosen id reaches the plugin as the top-level `model` field of the stdin envelope.

When the gateway exposes a **public, CORS-enabled** model catalog, the dropdown can
follow it live instead of waiting for a plugin release. Declare where it lives and how
each slot filters it:

```python
TONGFLOW_MODEL_CATALOG = {
    "url": "https://api.cometapi.com/api/models",   # GET, no auth
    "items": "data",                # dot-path to the record array (default "data")
    "id": "id",                     # dot-path to the model id (default "id")
    "exclude": {"upcoming": True},  # drop records where the field equals the literal
    "slots": {
        # field -> token(s): a record matches when every token is a substring of
        # that field (arrays / objects are JSON-serialized first); a "!"-prefixed
        # token must be absent instead
        "gen-text": {"features": "text-to-text", "endpoints": "/v1/chat/completions"},
        "image-gen": {"features": "text-to-image", "endpoints": "/v1/images/generations"},
        "text-gen-video": {"endpoints": ["/v1/videos", "!/v1/images"]},
    },
}
```

The canvas fetches `url` in the browser (cached ten minutes, re-checked when the
dropdown opens) and appends matching ids after the `TONGFLOW_SLOT_MODELS` shortlist;
on a fetch failure the shortlist alone is shown. If the catalog needs a bearer token
(e.g. a per-key `GET /v1/models`), add `"authEnv": "<ENV_KEY>"`: the canvas then calls
`GET /api/plugins/model-catalog?pluginId=…` and the app fetches the URL server-side
with `Authorization: Bearer <value from Settings>` — the key never reaches the browser
(see [tongflow-router-toapis](https://github.com/tong-io/tongflow-router-toapis)). The registry entry carries it as
`modelCatalog`. Because the plugin process is what ultimately receives the pick, apply
the same filter at run time (or accept any id the live catalog knows) rather than
rejecting everything outside the shortlist — see
[tongflow-router-cometapi](https://github.com/tong-io/tongflow-router-cometapi) for the
reference implementation.

### Advanced parameters (per-run knobs the node can expose)

Sampling steps, CFG, LoRA switches, samplers — the things a ComfyUI-style plugin
would otherwise hard-code or read from a deploy-time env var — can be offered on the
node under a collapsed **Advanced** section. Declare them next to your handlers, in
the plugin only (the main repo never carries a per-plugin table):

```python
TONGFLOW_SLOT_PARAMS = {
    "refs-gen-video": {
        "steps": {"type": "select", "options": [8, 20, 40], "default": 20, "label": "Steps"},
        "turbo": {"type": "boolean", "default": False},
        "shift": {"type": "number", "default": 12.0, "min": 1, "max": 20, "step": 0.5},
        "sampler": {"type": "text", "default": "euler"},
        # Router plugins: only offered while one of these models is selected
        "guidance": {"type": "integer", "default": 4, "models": ["fal-ai/x"]},
    },
}
```

- Pure literal only (AST-scanned, never imported), slot strings as keys, every slot
  needs a `@node_slot` handler. Param names are identifiers. Controls: `select`
  (`options`, string or number literals), `number` / `integer` (`min` / `max` /
  `step`), `boolean`, `text`; optional `label`, `description`, `default`, `models`.
  Always give a `default`: it is what the control shows before the user touches it,
  and it must equal the value the handler falls back to when the key is absent.
- The canvas stores only values that differ from `default` and sends them top-level
  as `params` (never inside the ABI prompt). They reach the slot body through the
  reserved `_params` key, which `@node_slot` pops into
  `tongflow.slots.current_params()`:

```python
from tongflow.slots import current_params

STEPS = int(os.environ.get("H3_STEPS") or 20)   # env stays the deploy-time default

def refs_gen_video(self, input: RefsGenVideoInput) -> RefsGenVideoOutput:
    p = current_params()
    steps = int(p.get("steps", STEPS))
    turbo = bool(p.get("turbo", False))
```

- Anything the user left untouched is absent from `current_params()`, so a node with
  the section collapsed behaves exactly as before. Older hosts that never send params
  simply yield an empty dict. Requires `tongflow>=0.3.3` in the plugin's pin.
- These are plugin internals by design: a knob that every implementation of a slot
  needs belongs in the ABI instead (see `CLAUDE.md`, "ABI hygiene").

### Assets in, assets out

Binary media crosses the wire as an `Asset`
([`sdk/tongflow/models/asset.py`](../sdk/tongflow/models/asset.py)):

- `Asset` carries `bytesBase64`, optional `mime`, optional `filename`.
- **Inputs** with a binary `$ref` arrive as `Asset` (already materialized — your plugin sees
  bytes, never a storage key).
- **Outputs** are also produced as `Asset` (you emit bytes). The server's
  [`convertAssetOutputsToFileRefs`](../src/lib/plugin-executor/convert-output-fileref.ts)
  uploads them and rewrites them into `{file_key}` refs for downstream nodes. You never deal
  with storage yourself.

Helpers in [`sdk/tongflow/protocol.py`](../sdk/tongflow/protocol.py):

| Helper | Use |
|---|---|
| `asset(data, *, mime, filename=None)` | Wrap raw `bytes` as an `Asset`. |
| `asset_from_path(path, *, mime=None)` | Read a file into an `Asset` (mime auto-detected from extension). |
| `asset_as_path(input.media, suffix=".mp4")` | Context manager: write an incoming `Asset` to a temp file, auto-cleanup on exit. Ideal for tools that need a file path. |
| `prompt_media_to_bytes(val)` | Decode an `Asset`/dict/base64 to raw `bytes`. |

---

## 5. What registers a handler

There is no registration list and no registration manifest. The scanner discovers a slot handler **purely
from the SDK annotations on your function** — it matches exactly three things, all from
`tongflow`:

1. the `@node_slot(NodeSlots.X)` decorator on the function;
2. its **first parameter** annotated with that slot's `*Input` model imported from
   `tongflow.models`;
3. its **return** annotated with the slot's `*Output` model from `tongflow.models`.

A function with all three is bound to slot `X`. Miss any one — no decorator, an un-annotated
parameter, a non-SDK type — and the scanner ignores it (functions whose names start with `_`
are skipped too). That decorator-plus-annotations pair **is** the entire contract; keep it and
TongFlow finds your handler. This is why the generated types matter and why static checking
(pyright/mypy) is the gate — see [§4](#4-the-sdk-contract).

### One runner for every plugin

The platform runs **every** plugin the same way: it spawns the plugin's local entry, writes the
request `{"nodeSlot": "...", "prompt": {...}}` to stdin, and reads the result JSON from stdout.
It knows nothing about *where* the work runs — that is entirely the plugin's business. Binary
results are returned as `Asset` via the [`protocol.py`](../sdk/tongflow/protocol.py) helpers and
the server converts them to file refs automatically (see [§4](#4-the-sdk-contract)).

There are two ways to be that entry:

**Self-contained (`entry.py`).** Your `entry.py` *is* the process — a small
stdin→dispatch→stdout loop that routes the incoming `nodeSlot` to the matching handler and
emits `{"success": false, "error": "..."}` on any exception. Handlers are **not** tied to
`entry.py`: the scanner walks **every `.py` file** for the annotation pattern above, so spread
them across modules and import them into `entry.py` for dispatch. From inside `entry.py` you can
reach anything — any API, an API router, your own backend, or local compute. Configuration (API
keys, model names, endpoints) comes from **environment variables**, never the ABI.

**Modal-backed (`deploy.py` + a bridge `entry.py`).** Author it as normal Modal: a class whose
methods carry **both** `@modal.method()` (outermost) and `@node_slot(NodeSlots.X)`, with the
image (pinning `tongflow`), `app = modal.App(Path(__file__).resolve().parent.name)`,
GPU/memory/timeout/Secrets/Volumes on the class, `@modal.enter()` to load models once, and an
optional `download.py` for weights. Mark the handler class with **`@deploy`** (tongflow's
backend-neutral marker) so the scanner knows it must be deployed before it runs. Then ship a thin
**`entry.py`** bridge — it's identical across Modal plugins, so copy it from any reference plugin:
it AST-discovers which class/method serves the requested slot from your `deploy.py`, deploys the
app on demand (cached by `deploy.py` content), invokes the method remotely, and streams progress.
`modal` is imported lazily inside that bridge and declared in `requirements.txt` — the SDK itself
no longer depends on it. Deploy-time knobs (model name, codecs, …) are module constants / env
vars, never ABI fields.

So a Modal plugin's deploy.py handlers (first arg `self`) are found by the scanner's deploy
parser; an `entry.py` plugin's handlers are found by the per-file walk. Either way, the
`@node_slot` + typed annotations are the only thing that registers them.

### Reference implementations

This guide deliberately doesn't reproduce a full plugin — the real ones stay correct as the SDK
evolves. The [**official plugins list in the developer guide**](developers.md#official-plugins) is the
set of working examples; pick one close to what you're building, `git clone` it into
`plugins/`, and use it as your template.

---

## 6. Local dependencies & progress

### `requirements.txt` — local deps, auto-installed

The platform runs your entry in a shared, managed Python venv (3.10+, created automatically).
If your plugin directory contains a `requirements.txt`, the platform installs it into that venv
on first run, cached by content hash. The tongflow SDK (and its dependencies) are always
present, so:

- A **Modal-backed** plugin's `requirements.txt` declares **`modal`** (the SDK is backend-neutral
  and no longer pulls it in) — that's what its `entry.py` bridge imports locally. Its heavy ML
  deps live in the Modal image, not here.
- A **self-contained** plugin lists whatever its `entry.py` imports (an API client, etc.).

Keep local requirements **thin**. The venv is shared across plugins, so a conflicting version
pin can collide with another plugin — the platform runs `pip check` and logs any conflict. Pin
heavy/exact versions in your remote image, not the local entry.

### `progress()` — stream status to the node

Call `tongflow.progress(...)` from anywhere in your plugin to push a live status line to the
running node:

```python
from tongflow import progress

progress("Generating frames", percent=40)
```

It writes a sentinel-framed line to stderr that the platform forwards to the task stream — it
works identically from a local entry or from inside a Modal method.

### 6.1 Declaring environment variables — `tongflow.plugin.json`

Users supply env vars (API keys, tokens, tuning knobs) through the Settings dialog; the platform
injects the stored values into your plugin's process on every run. To have the dialog render
your plugin as a card with its keys pre-filled, ship an optional **`tongflow.plugin.json`** at
the plugin root:

```json
{
    "env": [
        { "key": "OPENAI_API_KEY", "required": true, "description": "OpenAI API key", "url": "https://platform.openai.com/api-keys" },
        { "key": "OPENAI_BASE_URL", "default": "https://api.openai.com/v1", "description": "OpenAI-compatible base URL" },
        { "key": "OPENAI_CHAT_MODEL", "default": "gpt-4o-mini" }
    ]
}
```

Field semantics:

- **`key`** — the env var name (`UPPER_SNAKE`), exactly as your code reads it via
  `os.environ.get(...)`.
- **`required`** — required keys render flat in the card with a required marker; everything
  else is collapsed under an "Advanced" toggle.
- **`default`** — the value your code falls back to when the var is unset; shown as the input
  placeholder. Declare it on optional tuning knobs so users see the effective default.
- **`description`** — a short hint rendered under the input.
- **`url`** — where to obtain the credential (e.g. the provider's API-keys page); rendered as a
  link next to the key.

Keys declared by **two or more installed plugins** (e.g. `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`
for every Modal plugin, or `HF_TOKEN`) are automatically hoisted into a single "Shared" card
listing the plugins that use them — the value is stored once and reaches all of them.

The file is optional and presentation-only: a plugin without one still runs exactly the same,
its users just set the keys under "Custom variables" instead. An unreadable or invalid file is
logged and ignored — it never breaks the Settings dialog.

---

## 7. ABI gaps stay out of the ABI

The ABI is the **cross-plugin** product contract. A field that only one plugin needs — a model
name, an internal mode, an output codec — does **not** belong in the ABI. Make it a
module-level constant or an env var. Adding it to the ABI would force every other plugin on
that slot to account for a knob that's meaningless to them. If you reference a field that isn't
in the ABI, pyright will flag it — that's the signal to make it plugin-internal instead.

---

## 8. Evolving the ABI

Only evolve the ABI when you need a genuinely **new capability** — a slot that doesn't exist
yet, or a new field that *every* implementation of a slot should provide. Adding a model to an
existing slot does **not** require this.

The ABI's top-level `version` is an integer shared by TypeScript and Python. Changes fall into
two buckets:

- **Additive** (new optional slot, new optional input/output property, relaxed validation):
  bump `version` by 1; existing consumers keep working.
- **Breaking** (removing a slot, renaming a `nodeSlot` string, incompatible schema change):
  a larger coordinated change — it requires migrating saved flows, the DB, and plugins, and
  should be released together with a changelog/migration note.

Workflow when you do change it:

1. Edit [`packages/tongflow/abi/tongflow.abi.json`](../packages/tongflow/abi/tongflow.abi.json) — prefer explicit `required`
   when the product guarantees a value.
2. Regenerate the TypeScript types: `pnpm gen:abi`.
3. Regenerate and publish the Python SDK so plugins can import the new types:
   `pnpm tongflow:publish` (bump [`sdk/pyproject.toml`](../sdk/pyproject.toml) first).
4. Bump each affected plugin's `pip_install("tongflow==X.Y.Z")` pin to match.

---

## 9. Local dev loop & discovery

1. Drop your plugin directory into `plugins/<pluginId>/`.
2. Restart the app (or rely on the dev watcher) — the scanner picks it up and your node lists
   it as an available implementation.
3. Run `pnpm verify:plugins`
   ([`scripts/verify-plugins-scan.ts`](../scripts/verify-plugins-scan.ts)) to check that the
   scan resolves your slots cleanly.
4. Keep pyright/mypy green — static checking is the contract gate, so a type error means a real
   contract mismatch.

Common scan errors and fixes:

- *"pluginId must be all lowercase"* → rename the directory.
- *"pluginId must not encode gpu/cpu"* → drop `gpu`/`cpu` from the name.
- An unknown slot in `@node_slot(...)` → the string isn't in the ABI; use a `NodeSlots.*`
  constant.

---

## 10. Publishing & sharing

A plugin is just a git repo with the layout above. To share it, push it to GitHub — anyone can
`git clone` it into their own `plugins/` directory and the scanner discovers it automatically.
The official plugins maintained alongside this repo are listed in
[`config/official-plugins.json`](../config/official-plugins.json) and installed with
`pnpm plugins:install` (or `pnpm plugins:install <pluginId>` for one).

---

## Appendix: the `plugins/` directory at runtime

`plugins/` is **gitignored** and is **not** part of the source tree — it's a runtime data
directory, like `data/uploads/`. Each plugin is an independently versioned package, so pinning
their source into this repo would conflate release cycles. If `plugins/` is missing or empty,
the app falls back to an empty plugin registry: the UI still loads, but execution nodes can't
run until at least one plugin is installed.
