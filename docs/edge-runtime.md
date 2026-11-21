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
- The browser engine itself, the canvas transport and the edge plugins are follow-up work.

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
