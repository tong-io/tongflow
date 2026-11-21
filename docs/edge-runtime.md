# Edge runtime

The edge runtime runs TongFlow workflows **in the browser** so a user's files never leave it.
This page summarizes the decision behind it and lists the ABI slots added for it. Plugin
authors: the manifest format and naming rules are in
[plugins.md §3.1](plugins.md#31-edge-browser-plugins--tongflow-edge-).

## Decision

TongFlow gains a second execution engine: a browser-side TypeScript engine in
`packages/tongflow` that schedules the whole workflow in the browser.

- The Python engine reads every `$ref: Asset` input into bytes on the server before it calls a
  plugin. So any design that schedules on the server and only executes in the browser would
  still move the raw file to the server. The browser engine avoids that.
- Its node executor is injectable. An **edge executor** calls TypeScript edge plugins in a Web
  Worker. A **remote executor** sends server-side nodes back to the TongFlow backend, so mixed
  graphs (some nodes in the browser, some on the server) are a platform capability.
- TongFlow now has two engines (Python and TypeScript). A shared conformance test suite keeps
  their semantics from drifting; the Python engine's current behaviour is the reference.

Options considered and rejected:

- **The Python engine dispatches edge nodes to the browser** (two-way NDJSON bridge, edge nodes
  skip asset materialization): one engine, but every deployment then needs a server running
  Python and TongFlow, so a backend-free deployment is impossible.
- **A Python stub plugin forwards calls to the browser** (engine unchanged): the smallest change,
  but the raw file reaches the server first, so the privacy claim fails.

Consequences:

- **Plugin recognition.** Edge plugins are TypeScript and use the `tongflow-edge-*` prefix
  (`tongflow-local-*` already means on-device Python). The registry gains
  `runtime: "python" | "browser"`; the scanner, Studio, the Next app and the canvas recognize
  it. The first edge plugin is one package, `tongflow-edge-essentials`.
- **The ABI is followed literally.** Assets in the browser also use `bytesBase64`; there is no
  separate Blob form. Large files cost more memory, so hosts cap a single file at 100 MB.
- **New platform semantics** (TypeScript engine first, then Python): a failed node aborts only
  its own downstream branch; a run can be paused and resumed, a node skipped, or rerun with
  another implementation. Today the Python engine aborts the whole run on the first failure.
- **Canvas.** `CanvasHostConfig` gets an injectable task transport (replacing the native
  `EventSource` in `use-task.ts`) and an entry point to run the whole workflow.
- **Archives stay out of the graph.** The host unpacks them on upload; the ABI has no unpack
  slot.

## What exists today

- The 14 slots below, with canvas nodes, generated TypeScript types and Python models.
- Registry `runtime` field and `tongflow-edge-*` discovery from `tongflow.plugin.json`.
- The Python engine (Studio runs, Next workflow runs) and the Next single-node runner refuse a
  browser plugin with a clear *"requires the browser edge runtime"* error. They never try to
  spawn an `entry.py` for it or clone it.
- The canvas task transport and the run-whole-workflow entry (see
  [Canvas host transport & workflow runner](#canvas-host-transport--workflow-runner)).
- The browser engine (`tongflow/engine`, below), with a conformance suite shared with the
  Python engine.
- Mixed graphs: the HTTP remote executor and the `/api/engine/invoke` endpoint in Studio and
  the Next app (see [Mixed graphs & remote executor](#mixed-graphs--remote-executor)).
- Branch-level fault tolerance, pause / resume, skip and replace-and-rerun in the browser
  engine ([Fault tolerance and run control](#fault-tolerance-and-run-control)), and the canvas
  adapter that drives them from the canvas (`tongflow/engine/canvas`). The Python engine
  follows later.
- The edge plugins themselves are follow-up work.

## Browser engine (`tongflow/engine`)

A TypeScript port of the Python engine (`sdk/tongflow/engine`): bindings and batch fan-out,
Asset materialization, output views and batch merging. It lives in `packages/tongflow/src/engine`
(the core stays I/O-free) and ships as three entry points:

| Import | What |
|---|---|
| `tongflow/engine` | `runWorkflow`, `MemoryAssetStore`, `createCompositeExecutor`, `createInProcessEdgeExecutor`, `inlineAssets`, the types. Platform neutral. |
| `tongflow/engine/browser` | `createWorkerEdgeExecutor` (Web Workers) and `OpfsAssetStore` (Origin Private File System). |
| `tongflow/engine/worker` | For plugin authors: `defineEdgePlugin`, `edgeMethod`, the worker protocol types. |
| `tongflow/engine/canvas` | `createEngineCanvasRunner` (a canvas `workflowRunner` on this engine) and `createCanvasEventMapper`. Platform neutral, no React. |

```ts
import { createCompositeExecutor, runWorkflow } from "tongflow/engine";
import { OpfsAssetStore, createWorkerEdgeExecutor } from "tongflow/engine/browser";

const edge = createWorkerEdgeExecutor({
    registry,
    resolveModuleUrl: (id, plugin) => `/plugins/${plugin.localSubdir}/${plugin.entryFile}`,
});
const result = await runWorkflow(executableWorkflow, {
    executor: createCompositeExecutor({ registry, edge /*, remote */ }),
    store: new OpfsAssetStore(),
    inputs: { photo: ["opfs://3f2a….png"] },
    signal: abortController.signal,
    onEvent: (event) => console.log(event.type),
});
// result: { status: "success" | "partial" | "failed" | "cancelled",
//           outputs, outputsByName, errors, failures, skipped }
```

- **Events** have the Python engine's names and fields: `workflow_started`, `node_started`,
  `plugin_progress`, `node_completed`, `node_failed`, `workflow_completed` / `workflow_failed`.
  The TypeScript engine adds `model_download` (model weights being fetched, apart from
  progress), `node_cancelled`, `workflow_cancelled`, and for
  [run control](#fault-tolerance-and-run-control) `node_skipped`, `workflow_paused` and
  `workflow_resumed`.
  A host that plugs the engine into the canvas `workflowRunner` maps them one to one
  (`tongflow/engine/canvas` does exactly this):
  `node_started` → `node-start`, `plugin_progress` → `node-progress` (`percent / 100`),
  `model_download` → `node-download`, `node_completed` → `node-done` (with the raw `output`),
  `node_failed` → `node-error`, `node_skipped` → `node-skipped`, `workflow_paused` /
  `workflow_resumed` → `run-paused` / `run-resumed`, `workflow_completed` /
  `workflow_failed` / `workflow_cancelled` → `run-done`.
- **Executors.** A `NodeExecutor` gets `{pluginId, nodeSlot, prompt, model?, signal,
  onProgress}` and returns the raw ABI output; an optional `check()` fails a node before its
  inputs are read. `prompt` is the materialized input; advanced params ride under `_params`,
  as with the Python invoker. `createCompositeExecutor` sends `runtime: "browser"` plugins (or
  an unregistered `tongflow-edge-*` id) to the edge executor and `python` plugins to the remote
  executor. Without a remote executor a Python node fails with *"No remote executor
  configured"*. `createHttpRemoteExecutor` is the remote executor for a Studio or Next
  backend (see [Mixed graphs & remote executor](#mixed-graphs--remote-executor)).
- **Assets.** A `$ref: Asset` input holding a key becomes `{bytesBase64, filename, mime?}`:
  filename from the key's last path segment, mime from its extension, exactly as in Python.
  References resolve as a data URL, a key the asset store holds, or an http(s) URL. Outputs typed
  `FileRef` / `ImageRef` / `VideoRef` / `AudioRef` that carry `bytesBase64` are put into the
  store and become `{file_key, mime?, filename?}`; `ModelRef` is left as returned. Stores:
  `MemoryAssetStore` (`mem://` keys, for tests) and `OpfsAssetStore` (`opfs://<id>.<ext>`).
- **Failures** follow Python by default (`failurePolicy: "abort"`): the first failed node
  fails the run, nodes of later levels never start. `failurePolicy: "branch"` confines a
  failure to its own downstream; see below.

### Fault tolerance and run control

TypeScript engine only for now; the Python engine follows in a later change (its
conformance run skips these fixtures, see below).

**Failure policy.** `runWorkflow(doc, { failurePolicy })`:

- `"abort"` (default, Python's semantics): the first failure fails the run; siblings already
  running are cancelled; no later level starts.
- `"branch"`: a failed node marks every node of its downstream closure `skipped` with the
  reason `"upstream failed"` (one `node_skipped` per node, right after its `node_failed`);
  every other node keeps running. The closure follows the graph: an executable depends on
  another one when it binds its output, lists it in `dependencies`, or depends on a data
  node the other one feeds. A node with an input from a healthy branch is still skipped
  when another input comes from the failed one.

**Final status** (`RunResult.status`), the first rule that applies:

1. `failed`: a node failed under `"abort"`;
2. `cancelled`: the caller's `signal` aborted before every node settled;
3. `success`: every scheduled node completed;
4. `partial`: at least one node completed, the others failed or were skipped;
5. `failed`: no node completed (every node failed or was skipped).

`success` and `partial` end with `workflow_completed` (its `status` tells them apart),
`failed` with `workflow_failed`, `cancelled` with `workflow_cancelled`. `errors` and
`failures` list the nodes that are failed at the end (a node that failed and then reran
successfully is not listed); `skipped` lists `{nodeId, reason}` in level order.

**Run controller.** Create one with `createRunController()` and pass it as
`controller`; it drives one run at a time and every method is synchronous, safe to call
from an `onEvent` handler, and returns whether it changed anything (`false` for an unknown
node, a request the node's state does not allow, or when no run is attached):

```ts
const controller = createRunController();
const done = runWorkflow(doc, { executor, store, failurePolicy: "branch", controller });

controller.pause();            // no new node starts; running ones finish → workflow_paused
controller.resume();           // → workflow_resumed
controller.skipNode("ocr");    // before it starts, or while it runs (signal aborted)
controller.replaceImplementation("ocr", { pluginId: "tongflow-edge-essentials", model: "pp-ocrv6" });
controller.nodeStatus("ocr");  // "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled"
controller.paused; controller.active;
```

| Call | Allowed when | Effect |
|---|---|---|
| `pause()` | not paused (also before the run starts: it starts paused) | `workflow_paused` at once; nodes already running finish and report as usual. A paused run does not end even when nothing is left to run, so a finished or failed node can still be replaced. A caller abort, or a failure under `"abort"`, still ends it. |
| `resume()` | paused | `workflow_resumed`; scheduling continues. |
| `skipNode(id)` | `pending` or `running` | The node becomes `skipped` (`"skipped by user"`); a running node's executor `signal` is aborted and its late result ignored. Its whole downstream closure is skipped (`"upstream skipped"`), **including nodes that have other, satisfied inputs**: skipping is a statement about the branch, not about a single input. Skipping is not a failure, so it does not abort a run under `"abort"`. |
| `replaceImplementation(id, {pluginId, model?})` | `pending` (not started) | The node will run with that plugin / model. |
| | `completed` or `failed` | The node reruns with it. Every downstream node that already ran (or is running, which is cancelled with `node_cancelled`) becomes stale and reruns. Under `"branch"`, nodes skipped because of it are un-skipped unless another failed or skipped upstream still blocks them; nodes the user skipped stay skipped. Refused while the node runs or once it is skipped. |

`model` omitted means the plugin's default model. The node's advanced params (`_params`)
are kept only when `pluginId` does not change, since they are plugin-specific.

**Consistency.** A node only starts when every node of every earlier level has settled,
and a level's outputs are committed into the run state (output views, data-node values) in
level order once it settles, as before. A rerun first removes the node's committed outputs
(and those of its stale downstream), restoring their data nodes to their seeded values,
then sends the scheduler back to the rerun node's level; nodes of the current level that
do not depend on it finish normally. Events raised from inside an `onEvent` handler (for
example by a controller call) are delivered after the current one, in the order the state
changed.

### Canvas adapter (`tongflow/engine/canvas`)

```ts
import { createEngineCanvasRunner } from "tongflow/engine/canvas";

const runner = createEngineCanvasRunner({
    executor: createCompositeExecutor({ registry, edge }),
    store: new OpfsAssetStore(),
    // failurePolicy: "branch" is the default here; concurrency, inputs, abi, fetch as for runWorkflow
    onEngineEvent: (e) => {},   // optional: every raw engine event
    onResult: (result) => {},   // optional: each finished run's RunResult
});
<CanvasProvider workflowRunner={runner}>…</CanvasProvider>
```

`runner` is a `CanvasWorkflowRunner`: it maps engine events with the table above
(`node_cancelled` has no canvas counterpart; `workflow_completed` with `partial` still
maps to `run-done {ok: true}`, the failed and skipped nodes keep their own state;
`workflow_failed` carries the joined errors). `runner.controls` forwards `pause`,
`resume`, `skipNode` and `replaceImplementation` to the run in flight (`false` when idle),
and `runner.controller` is that run's `RunController` (`null` when idle). One run at a
time per runner.

### Edge plugin worker protocol

An edge plugin's ESM entry runs in its own dedicated module worker, one per plugin, reused
across nodes and runs. Its default export is `defineEdgePlugin({ methods })`; the method names
are the `method` values of its `tongflow.plugin.json` slots:

```ts
import { defineEdgePlugin, edgeMethod } from "tongflow/engine/worker";

export default defineEdgePlugin({
    methods: {
        ocrImage: edgeMethod("ocr-image", async (input, ctx) => {
            ctx.modelDownload({ model: "pp-ocrv6", loaded, total });
            ctx.progress("recognizing", 40);
            return { success: true, text: await recognize(input.image.bytesBase64, ctx.signal) };
        }),
    },
});
```

`edgeMethod` types `input` as `SlotInput<S>` and the return as `SlotOutput<S>` with
`bytesBase64` allowed in ref fields. `ctx` carries `nodeSlot`, `model`, `params`, an abort
`signal`, `progress(message, percent?)` and `modelDownload({loaded, total?, model?, file?})`.
The messages (protocol version 1, plain structured-clone data):

| Direction | Message |
|---|---|
| worker → host | `{type: "ready", protocol: 1, methods}`, once on load |
| host → worker | `{type: "invoke", id, method, nodeSlot, input, model?, params?}` |
| worker → host | `{type: "progress", id, message, percent?}` |
| worker → host | `{type: "model-download", id, loaded, total?, model?, file?}` |
| worker → host | `{type: "result", id, output}` or `{type: "error", id, message, name?}` |
| host → worker | `{type: "cancel", id}` (aborts `ctx.signal`) |

A worker `error` event fails the plugin's pending calls; the next call starts a new worker.
`terminateOnAbort` terminates the worker on cancel instead, for plugins that cannot stop
mid-call. `createInProcessEdgeExecutor({ registry, loadPlugin })` calls the same definitions
without a worker, for tests and workerless hosts.

### Conformance suite

`packages/tongflow/conformance/*.json` is run by both engines: the TypeScript engine in vitest
(`src/engine/conformance.test.ts`), the Python engine in pytest (`sdk/tests/test_conformance.py`,
through `run_workflow(invoker=…)`). Each fixture holds an exported `ExecutableWorkflow`, fake
plugins declared as data (`plugins`: plugin id → steps such as `format`, `map`, `asset`,
`assets`, `fail`, `raise`, optionally `when`), seeded files (`assets`), runtime `inputs`, and
the `expected` result and events. Python is the reference: `python tests/test_conformance.py
--record` (from `sdk/`) rewrites `expected`; review the diff before committing it.

| Fixture | Covers |
|---|---|
| `linear-chain` | two nodes through a text node |
| `batch-fan-out` | `batchField` fan-out, config broadcast, `batch i/N` progress |
| `collect-all` | `collectAll` array input from two text nodes |
| `expand-each-assets` | file in → `x-expand-each` ImageRef pages → fan-out over the pages |
| `asset-roundtrip` | uploaded image → Asset → stored ref → re-materialized downstream |
| `workflow-inputs` | runtime inputs over start data nodes, a `data:` URL |
| `model-ref-excluded` | `ModelRef` output is not stored |
| `multi-level-dag` | diamond, collector, fan-out; level order |
| `model-and-params` | model and `_params` reach the plugin |
| `failure-abort` | `success: false` fails the run; sibling kept, downstream never starts |
| `failure-batch-item` | a failed batch item, `(batch item 2/3)` suffix |
| `plugin-exception` | a plugin that throws |
| `scalar-overflow` | several values into a non-batch scalar input |

**TypeScript-only fixtures.** A fixture with `"engines": ["ts"]` is skipped by the pytest
(and left alone by `--record`) until the Python engine implements the semantics; its
`expected` was written from the TypeScript engine and reviewed by hand. These fixtures can
set `failurePolicy` and `control`, a list of controller calls declared as data: each step
fires once, on the `nth` (default first) event whose fields equal `on`, and calls
`pause` / `resume` / `skipNode` / `replaceImplementation` (`nodeId`, `pluginId`, `model`)
inside the event handler, or from a later macrotask with `defer: true`. Their fake plugins
may use two more ops, `progress` (`message`, `percent`) and `wait-for-abort` (blocks until
the node's signal aborts). The projected result adds `skipped` when a node was skipped and
`control` (each call's return value, in firing order); the projected events add
`node_skipped` (`nodeId`, `reason`), `node_cancelled` (`nodeId`), `workflow_paused`,
`workflow_resumed` and `workflow_cancelled`. When the Python engine follows, it adopts the
same vocabulary and drops the flag.

| Fixture | Covers |
|---|---|
| `branch-failure-isolation` | `branch`: a failure skips its downstream closure, including a collector also fed by the healthy branch; the sibling branch completes; `partial` |
| `control-skip-before-start` | skip before start skips the closure despite a satisfied input; skipping a completed node is refused |
| `control-skip-while-running` | skip while running aborts the node's signal; sibling completes |
| `control-pause-resume` | running node finishes after `pause`, the next one waits for `resume`; a second `pause` is refused |
| `control-replace-rerun` | replace before start (plugin and model), refused while running, after completion: rerun plus stale downstream rerun |
| `control-replace-failed-unskip` | `branch`: replacing a failed node from a `node_skipped` handler reruns it and un-skips its downstream; the failure leaves the result |

Every fixture runs twice in TypeScript: with `concurrency: 1` the result and the event stream
must equal Python's exactly; with the default (whole level in parallel, staggered latency) the
outputs and each node's events must be equal and levels must run in order. For the
TypeScript-only fixtures the parallel run checks the result only (controller steps react to
events, so the order is timing-dependent there), without staggered latency when they have
`control` steps.

**Documented differences** (none visible in a successful run's result):

- Nodes of one level run concurrently by default (Python runs them one by one), so events of
  sibling nodes interleave. State is still committed in level order, and the outputs are
  identical. `concurrency: 1` restores Python's order.
- When a node fails, siblings already running in its level are cancelled (`node_cancelled`);
  Python would not have started the ones after it. The errors, failures and the outputs of
  earlier levels are identical.
- Results keep store keys (`{file_key}`); `inlineAssets(value, store)` gives Python's inline
  form. There is no filesystem search: a key the store does not hold fails the node.
- `plugin_progress` from a plugin always carries `nodeId` (Python's subprocess progress only
  carries `pluginId`).

## Mixed graphs & remote executor

A browser-run workflow can mix edge nodes with server nodes. The composite executor sends
`runtime: "browser"` plugins to the edge executor and every other plugin to a remote executor;
`createHttpRemoteExecutor` (in `tongflow/engine`, HTTP only, no DOM) runs those nodes on a
TongFlow backend:

```ts
import {
    createCompositeExecutor,
    createHttpRemoteExecutor,
    runWorkflow,
} from "tongflow/engine";

const remote = createHttpRemoteExecutor({
    baseUrl: "/tongflow/p/PRJ-1", // Studio; "" or "https://app.example" for the Next app
    headers: { authorization: `Bearer ${token}` }, // optional; or () => headers per request
    confirm: async (c) => window.confirm(`${c.pluginId} bills you (${c.billing}): ${c.note}`),
});
await runWorkflow(doc, {
    executor: createCompositeExecutor({ registry, edge, remote }),
    store,
});
```

`baseUrl` is the same base the canvas uses as `apiBaseUrl`. `fetch` defaults to
`globalThis.fetch`. The browser decides which nodes leave it: only the inputs of a server node
are sent to the server, as the engine already materialized them (`bytesBase64`, per the ABI).

### Endpoint contract

Both hosts serve the same two endpoints under their API base (Studio:
`/tongflow/p/:pid/api/engine/…`; Next app: `/api/engine/…`). The types live in
`tongflow/engine` (`RemoteInvokeRequest`, `RemoteInvokeFrame`, `RemoteInvokeErrorBody`).

`POST {base}/api/engine/invoke`

```json
{ "pluginId": "tongflow-modal-x", "nodeSlot": "image-upscale",
  "prompt": { "image": { "bytesBase64": "…", "filename": "a.png", "mime": "image/png" } },
  "model": "optional", "_params": { "steps": 4 }, "confirmed": true }
```

`prompt` holds the ABI business fields; the node's advanced params ride top-level as
`_params` (the executor takes them out of the engine's prompt). `confirmed` is set only after
the user agreed to a paid run.

**Progress is streamed** (SSE read through `fetch`, not `EventSource`, so the request has a body
and the host's headers). The `200` response is `text/event-stream`; each `data:` line is one
JSON frame:

| Frame | When |
|---|---|
| `{type: "started", invocationId}` | First. The id the stop endpoint takes |
| `{type: "progress", message, percent?}` | The plugin's progress (0–100); becomes the node's `plugin_progress` |
| `{type: "result", output}` | Last, on success: the raw ABI output, assets as `bytesBase64`. The browser engine stores them, so downstream nodes see browser keys |
| `{type: "error", error, code?}` | Last, on failure (`code: "failed"`, `error` = the plugin's message) or cancellation (`"cancelled"`) |

A call refused before it starts gets a JSON error instead, `{error, code, …}`:

| Status | `code` | Why |
|---|---|---|
| 400 | `invalid_request` | Malformed body, unknown slot, or the plugin lacks the slot |
| 400 | `browser_plugin` | A `runtime: "browser"` plugin (or an unregistered `tongflow-edge-*` id): the server cannot run it |
| 400 | `plugin_not_installed` | The plugin is not in the host's registry |
| 409 | `needs_confirmation` | Studio only: a paid plugin (API key or Modal) without `confirmed`. Carries `confirmation: {pluginId, nodeSlot, billing, note}` |
| 400 | `missing_api_key` | Next app only: a required key is unset (with `key`, `url`), the same preflight as a single-node task |
| 401 / 403 | — | The host's own auth refused the request |

The executor turns every refusal and `error` frame into a `RemoteExecutorError` (`code`,
`status`, `confirmation`), so the node fails with the message. For `needs_confirmation` it
calls `confirm(confirmation)` first when given: `true` resends the call with
`confirmed: true`; otherwise the node fails with *"Plugin X (nodeSlot=…) bills you (api: …).
Confirm the run before it executes on the server."* `confirm` is called every time the backend
asks; nothing is remembered.

**Cancellation.** Aborting the node's signal posts `POST {base}/api/engine/invoke/stop`
`{invocationId}` (answer `{status: "cancelled", wasRunning}`) and drops the stream. Both hosts
also stop the run when the stream's connection closes, so a lost stop request still stops it.

### Hosts

- **Studio** (`packages/tongflow-studio`, `StudioApi.startInvoke`): the prompt becomes a
  one-node document (`singleNodeDocument`, as for a canvas run) with the node's `_params`,
  run by `executeRun` with **inline outputs**: the Python engine keeps outputs in memory and
  returns `bytesBase64`, and nothing is written into the project (no `.runs/`, no numbered
  outputs, no provenance). The run is listed as `invoke <slot>`. Auth is the Studio page's
  token cookie and same-origin check. The billing checkpoint is the one `tongflow_workflow_run`
  uses: `pluginBilling` says `api` or `modal` → `needs_confirmation` unless `confirmed`.
- **Next app** (`src/app/api/engine/invoke`, `src/lib/task/remote-invoke.server.ts`): the
  single-node task path without the tasks table: the missing-key preflight, then
  `executePlugin` with `inlineOutputs`, which skips the `{file_key}` conversion. Progress comes
  from the plugin runner's task events. Auth is the self-host access gate (middleware). The
  Next app has no per-run billing confirmation, so it never answers `needs_confirmation` and
  ignores `confirmed`.

## Graph rules for edge nodes

Edge nodes follow the usual grammar: executables never connect directly; values travel through
data nodes (text, image, audio, video, file, 3D model). Structured results are text: a JSON
string, or several texts. Binary results are file refs.

## Slots reused as-is

These existing slots get an edge implementation; their schemas do not change.

| Slot | Edge implementation |
|---|---|
| `parse-document` | Every document format (pdf, docx, pptx, xlsx, csv, email, HTML, EPUB, legacy formats), dispatched by MIME type |
| `transcribe` | SenseVoice |
| `extract-audio` | Mediabunny |
| `split-video` | TransNetV2 shot detection |
| `get-first-frame` | Shot thumbnails |
| `image-describe` | Qwen3.5-0.8B (tier 3) |
| `gen-text` | LFM2.5-350M (tier 3) |

## New slots

Every output also carries the usual `success` / `error`. "Expands" marks an `x-expand-each`
array: on the canvas each item becomes its own data-node entry.

| Slot | Node type | Inputs | Outputs |
|---|---|---|---|
| `render-pages` | `renderPagesNode` (decompose) | `document`: Asset, from a file node, batched | `pages`: ImageRef[] (expands) |
| `image-orient` | `imageOrientNode` (transfer) | `image`: Asset, batched | `image`: ImageRef |
| `layout-detect` | `layoutDetectNode` (decompose) | `image`: Asset, batched | `layout`: string (JSON region list); `regions`: ImageRef[] (expands; cropped regions) |
| `ocr-image` | `ocrImageNode` (transfer) | `image`: Asset, batched | `text`: string (PP-OCRv6 by default; GLM-OCR is a tier-3 implementation of the same slot) |
| `table-recognize` | `tableRecognizeNode` (transfer) | `image`: Asset, batched | `html`: string |
| `chunk-text` | `chunkTextNode` (compose) | `texts`: string[], every connected text node collected; `max_chars`?: integer (config) | `chunks`: string[] |
| `embed-text` | `embedTextNode` (compose) | `texts`: string[], collected | `vectors`: FileRef (float32 binary; header carries dimension and count) |
| `embed-image` | `embedImageNode` (transfer) | `image`: Asset, batched | `vectors`: FileRef (tier 3, EmbeddingGemma 2) |
| `kb-write` | `kbWriteNode` (compose) | `chunks`: string[], collected from text nodes; `vectors`: Asset, from a file node; `source`: string (config, the source file name) | `text`: string (summary of what was stored). The host does the actual storage. |
| `vad-segment` | `vadSegmentNode` (decompose) | `audio`: Asset, batched | `segments`: AudioRef[] (expands) |
| `diarize-speakers` | `diarizeSpeakersNode` (transfer) | `audio`: Asset, batched | `segments`: string (JSON: speaker / start / end) |
| `audio-tag` | `audioTagNode` (transfer) | `audio`: Asset, batched | `tags`: string (JSON labels and scores) |
| `detect-objects` | `detectObjectsNode` (transfer) | `image`: Asset, batched | `objects`: string (JSON classes, boxes, scores) |
| `detect-language` | `detectLanguageNode` (transfer) | `text`: string, batched over a text node's items | `language`: string (ISO 639-1) |

`chunk-text` takes `texts: string[]` rather than a single `text`: collecting every connected
text node means the plugin receives an array, and the plugin joins the parts before chunking.

No official plugin implements these slots yet; the developer guide lists them as planned.

## Canvas host transport & workflow runner

The canvas (`tongflow/canvas`) never assumes where a task runs. Two optional
`CanvasHostConfig` fields (set with `<CanvasProvider>` or `configureCanvasHost`) let a
host run nodes in the browser. Hosts that set neither, such as the Next app and Studio
today, behave exactly as before.

### Task transport (single-node runs)

```ts
interface CanvasTaskTransport {
    createTask(request: CreateTaskRequest): Promise<CreateTaskResponse>; // {taskId}
    waitTask(taskId: string, handlers: TaskWaitHandlers): TaskWaitConnection;
    stopTask(taskId: string): Promise<boolean>; // true = stop accepted
    updateTaskStatus(request: UpdateStatusRequest): Promise<UpdateStatusResponse>;
}
interface TaskWaitHandlers {
    onOpen(): void;
    onMessage(message: TaskWaitMessage): void; // {id, status, data?, progress?, error?, nodeId?}
    onClose(): void;          // the producer ended the stream on purpose
    onError(error: unknown): void; // the stream dropped; the canvas reconnects with backoff
}
interface TaskWaitConnection { close(): void }
```

- `taskTransport` replaces task create, wait, stop and update-status for every node run
  (`useCreateTask`, `useBatchTaskManager`). The default, `httpTaskTransport`, is the
  previous behaviour: `POST /api/task/create`, an `EventSource` on `/api/task/wait`,
  `POST /api/task/stop` and `POST /api/task/update-status`, all through `host.fetch`
  except the `EventSource`.
- `TaskWaitMessage` is the `/api/task/wait` SSE message. `status` uses the task status
  strings (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` …). On `COMPLETED`,
  `data` is the plugin output; the node routes it into its downstream data nodes as it
  does for a server task. Any terminal status makes the canvas call `updateTaskStatus`
  and `close()`.
- A transport may call the handlers at any time after `waitTask` returns. Calls made
  synchronously inside `waitTask` are deferred to a microtask.
- To override only part of it, spread the default:
  `{ ...httpTaskTransport, waitTask: myWait }`.

### Workflow runner (whole-workflow runs)

```ts
interface CanvasWorkflowRunner {
    run(doc: ExecutableWorkflow, options: {
        signal: AbortSignal;
        onEvent(event: CanvasWorkflowRunEvent): void;
    }): Promise<void>;
    controls?: CanvasWorkflowRunControls; // optional, see below
}
interface CanvasWorkflowRunControls {
    pause(): boolean;
    resume(): boolean;
    skipNode(nodeId: string): boolean;
    replaceImplementation(nodeId: string, impl: { pluginId: string; model?: string }): boolean;
}
```

When `workflowRunner` is set, the canvas shows a **Run workflow** action in its top-right
corner. The action becomes **Stop** while a run is in flight. Clicking it exports the
current graph with `exportWorkflow(nodes, edges)` and calls `run`. Stop aborts `signal`;
the canvas then resets to idle and ignores later events. The canvas depends only on this
interface, not on any engine package. An engine adapts its own events to these:

| Event | Payload | What the canvas does |
|---|---|---|
| `run-start` | — | Clears the previous run's node states; workflow status `running` |
| `node-start` | `nodeId` | The node shows its running spinner and timer |
| `node-progress` | `nodeId`, `fraction?` (0..1), `message?` | Progress bar with percentage; `message` replaces the status text |
| `node-download` | `nodeId`, `loaded`, `total?` (bytes), `label` | A separate download view: "Downloading model 120/237 MB" plus `label` and a bar. The next `node-progress` replaces it |
| `node-done` | `nodeId`, `outputView`, `output?` | Node `completed`; results go into downstream data nodes through the same `expands` path as a single-node task (`output`, the raw plugin result, is preferred when present because it keeps array-of-arrays groups; otherwise `outputView`, i.e. `computeOutputView(node.outputs, result)`) |
| `node-error` | `nodeId`, `message` | Node `failed`; the message is shown on the node |
| `node-skipped` | `nodeId`, `reason?` | Node `skipped`: a grey, dashed "Skipped" (已跳过) state with the reason (by you / an upstream node was skipped / an upstream node failed); a later `node-start` (an un-skipping rerun) replaces it |
| `run-paused` | — | Workflow status `paused` |
| `run-resumed` | — | Workflow status `running` |
| `run-done` | `ok`, `error?` | Workflow status `completed` / `failed`; nodes still marked running are cleared; components that received results are tidied |

`nodeId` is the canvas node id (`ExecutableNode.id`). If `run` resolves without a
`run-done`, the canvas adds `run-done {ok: true}`. If it rejects, the canvas adds
`{ok: false}`. Node states live in the exported `useTaskStore` (`nodeExecutionStatusMap`,
`nodeRunProgressMap`), so a host can also show them elsewhere.

**Live controls.** A runner may expose `controls` (calls address the run in flight and
return whether they were accepted). While a run started from the canvas is in flight:

- a **Pause** / **Resume** button (暂停 / 继续) sits next to **Stop**;
- an executable node's menu offers **Skip** (跳过) while the node has not started or is
  running, and **Replace implementation** (换实现) while it has not started or has
  completed or failed: a submenu of the other installed plugins of the node's slot, from
  the plugins registry. Choosing one calls `replaceImplementation(nodeId, {pluginId})` and,
  when accepted, sets the node's `pluginId` on the canvas so the next run uses it too.

Without `controls`, or without a runner at all (the Next app and Studio today), none of
this appears. `tongflow/engine/canvas` implements the whole contract on the browser engine
([Canvas adapter](#canvas-adapter-tongflowenginecanvas)).
