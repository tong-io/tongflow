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
- The browser engine itself and the edge plugins are follow-up work.

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
| `run-done` | `ok`, `error?` | Workflow status `completed` / `failed`; nodes still marked running are cleared; components that received results are tidied |

`nodeId` is the canvas node id (`ExecutableNode.id`). If `run` resolves without a
`run-done`, the canvas adds `run-done {ok: true}`. If it rejects, the canvas adds
`{ok: false}`. Node states live in the exported `useTaskStore` (`nodeExecutionStatusMap`,
`nodeRunProgressMap`), so a host can also show them elsewhere.
