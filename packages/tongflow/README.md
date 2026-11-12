# tongflow

The core of [TongFlow](https://github.com/tong-io/tongflow), the
Agent-Human-Friendly, Modality-First, Enterprise-Level GenAI Workflow Platform,
as an npm package with two entries:

- **`tongflow`** — framework-free: the ABI contract, the static node
  registry, connection validation, the workflow exporter, canvas layout, a
  **headless canvas model** and the **agent graph tools** that let an external
  agent build and edit workflows programmatically. No React, no Next.js, no
  I/O — it runs in Node, browsers and workers alike.
- **`tongflow/canvas`** — the React canvas (`FlowCanvas`, every node/edge
  component, hooks, UI primitives) that renders and edits that model against a
  TongFlow-compatible API.

Execution is not in this package: export a workflow and hand it to the
Python SDK engine (`pip install tongflow`, `python -m tongflow.engine`).

```sh
npm install tongflow zustand            # core
npm install react react-dom @xyflow/react use-intl   # + canvas peers
```

`zustand` is a peer dependency (the headless store is a `zustand/vanilla`
store). `@xyflow/react`, `react`, `react-dom` and `use-intl` are optional
peers only the canvas entry needs.

## What's inside

| Area | Exports (selection) |
|---|---|
| ABI contract | `ABI_NODES`, `ABI_DEFINITIONS`, `NodeSlot`, generated per-slot input/output types, `TONGFLOW_ABI_VERSION`; the JSON itself at `tongflow/abi` |
| Static node registry | `NODE_TYPE_TO_ABI_FEATURE`, `NODE_TYPE_SOURCE_SPEC`, `abiSpecForNodeType`, `resolvedSpecForNodeType`, `resolveEdgeHandles`, `getAbiTopology`, `resolveSpec` |
| Workflow | `exportWorkflow` → `ExecutableWorkflow`, `WorkflowParser`, `isWorkflowValid`, `isValidFlowConnection`, `getEdgeTargetOptions`, `parseWorkflowImportJson` |
| Layout | `computeAutoLayout`, `componentsContaining`, `estimateNodeSize` |
| Headless store | `createFlowStore`, `createFlowSlice`, `FlowCoreState`, `addEdgeIfAbsent` |
| Agent tools | `TONGFLOW_TOOL_DEFS`, `applyGraphPatch`, `readCanvas`, `validateWorkflow`, `describeNodeType`, `executeGraphTool`, `renderCanvas` |
| Registry schemas | `PluginsRegistrySchema`, `FeatureRegistryBundleSchema` (zod) |

## Build a workflow headlessly

```ts
import {
    createFlowStore,
    applyGraphPatch,
    validateWorkflow,
    exportWorkflow,
} from "tongflow";

const store = createFlowStore();

// One coherent change: nodes to create, edges to draw, params to set.
const result = applyGraphPatch(store, {
    add_nodes: [
        { alias: "t1", type: "textNode", data: { texts: ["a cat, cartoon"] } },
        { alias: "gen", type: "textGenImageNode", data: { width: 1024, height: 1024 } },
        { alias: "img", type: "imageNode" },
    ],
    add_edges: [
        { from: "t1", to: "gen" },
        { from: "gen", to: "img" },
    ],
});
console.log(result.ok, result.steps);

// Health-check (cycles, unconnected required inputs, empty config, plugins).
console.log(validateWorkflow(store, { registry: myPluginsRegistry }));

// Export the executable form the Python engine runs.
const { nodes, edges } = store.getState();
const executable = exportWorkflow(nodes, edges, { name: "cat" });
```

Give an LLM the tools with your provider's envelope and dispatch by name:

```ts
import { TONGFLOW_TOOL_DEFS, executeGraphTool } from "tongflow";

const openaiTools = TONGFLOW_TOOL_DEFS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
}));

// ...when the model calls a tool:
const out = executeGraphTool(store, call.name, call.arguments, {
    historySource: `agent:${turnId}`,
    registry: myPluginsRegistry,
});
```

The graph rules an agent must follow (the strict
`add → data → executable → data → …` alternation, never inventing ids, etc.)
are documented in
[`docs/agent-workflow-manual.md`](https://github.com/tong-io/tongflow/blob/main/docs/agent-workflow-manual.md).

## The React canvas (`tongflow/canvas`)

```tsx
import "@xyflow/react/dist/style.css";
import "tongflow/canvas.css";
import { ReactFlowProvider } from "@xyflow/react";
import { IntlProvider } from "use-intl";
import { CanvasProvider, FlowCanvas, canvasMessages, useFlow } from "tongflow/canvas";

export function Studio() {
    return (
        <IntlProvider locale="en" messages={canvasMessages.en}>
            <CanvasProvider apiBaseUrl="https://my-tongflow-server" locale="en">
                <ReactFlowProvider>
                    <div style={{ width: "100%", height: "100vh" }}>
                        <FlowCanvas />
                    </div>
                </ReactFlowProvider>
            </CanvasProvider>
        </IntlProvider>
    );
}
```

- `FlowCanvas` renders the whole TongFlow node set over the flow store
  (`useFlow`), validates connections against the ABI while dragging, and
  exposes `fitView` / `focusNode` / `tidyLayout` through a ref. Overlays go in
  as `children`.
- `CanvasProvider` / `configureCanvasHost` point the canvas at a
  TongFlow-compatible HTTP API (`/api/task/create`, `/api/task/wait` SSE,
  `/api/upload`, `/api/plugins/registry`, …), optionally with a custom
  `fetch` and an asset-URL resolver. Defaults are same-origin.
- `canvasMessages[locale]` are the i18n catalogs (`en` / `zh` / `ja` / `ko`);
  merge them into your `use-intl` (or `next-intl`) provider. Import them from
  `tongflow/canvas/messages` in server code (RSC / SSR) — that entry carries no
  `"use client"` directive.
- Styling is Tailwind v4 utilities + TongFlow's tokens in `tongflow/canvas.css`
  (no preflight — bring your own base styles). React 18 and 19 are supported.

The TongFlow app itself is the first host: its `useFlow` is
`createFlowSlice` + React Flow callbacks + a localStorage subscription, and its
workspace shell composes navigation, dialogs and persistence around
`FlowCanvas`.

## Versioning

The ABI (`tongflow/abi`) is versioned independently (`TONGFLOW_ABI_VERSION`);
the Python SDK bundles the same JSON. Keep the npm package and
`pip install tongflow` on matching ABI versions.

License: AGPL-3.0-only.
