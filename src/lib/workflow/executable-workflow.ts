/**
 * Executable workflow definitions
 * Used to export workflow JSON that can be independently executed by the backend
 */

import type { Edge, Node } from "@xyflow/react";

/* ========================================================================== */
/* Type definitions                                                             */
/* ========================================================================== */

/**
 * Source for a single ABI input field. Discriminated by `kind`.
 *  - `handle`: comes from one or more upstream nodes via a target Handle
 *  - `config`: literal value harvested from the node's own form/config
 *  - `static`: literal value declared via the sourceSpec `staticValue` helper
 *  - `input`: workflow-level input, supplied at execution time
 *
 * `fromField` semantics depend on the upstream:
 *  - upstream is an executable → ABI output field name (e.g. `text`, `image`,
 *    `video_parts`). The runner reads from the upstream's projected
 *    `AbiOutputView`.
 *  - upstream is a data node → canvas-side data field (`texts` / `fileKeys`).
 *    The runner reads from `dataNodeState` (initialized from `staticData` and
 *    refreshed after each executable completes).
 *
 * `consumerShape` reflects the ABI shape of the destination input:
 *  - `"scalar"` → runner takes the first value across collected sources.
 *  - `"array"` → runner concatenates all collected values into an array.
 */
export type FieldBinding =
    | {
          kind: "handle";
          sources: { fromNodeId: string; fromField: string }[];
          /** RF target handle id (`in:<field>`). */
          targetHandle: string;
          /** Plugin-side input shape (`"scalar"` for a single value, `"array"` for a list). */
          consumerShape: "scalar" | "array";
      }
    | { kind: "config"; value: unknown }
    | { kind: "static"; value: unknown }
    | { kind: "input"; inputName: string };

/**
 * Canonical projection of a single executable's output, indexed by ABI source
 * field. `values` is always normalized to string[] (asset $refs already
 * extracted via `itemValuePath`, scalars wrapped to length-1 arrays).
 */
export interface OutputRoute {
    /** ABI output field name on the plugin (e.g. `text`, `image`, `video_parts`). */
    sourceField: string;
    /** Canvas node type this channel feeds (`textNode`, `imageNode`, …). */
    nodeType:
        | "videoNode"
        | "audioNode"
        | "imageNode"
        | "textNode"
        | "modelNode"
        | "fileNode";
    /** Where the projected values land on a canvas data node. */
    dataField: "fileKeys" | "texts";
    /** True for `x-expand-each` outputs (one downstream data node per item). */
    expandEach: boolean;
    /** When the source is an Asset/$ref object, the property name to extract. */
    itemValuePath?: string;
    /** True when the source is array-of-arrays (e.g. `groups: VideoRef[][]`). */
    isArrayOfArrays?: boolean;
    /** Direct downstream data node fed by this channel, if any (set by exporter). */
    downstreamDataNodeId?: string;
}

/**
 * Executable node definition
 */
export interface ExecutableNode {
    /** Node ID */
    id: string;
    /** RF node type (`textGenImageNode`, etc.) */
    type: string;
    /** ABI feature identifier (slot) */
    feature: string;
    /** Plugin implementation chosen on the canvas (`tongflow-<runner>-*`). */
    pluginId: string;
    /** Node display name (used for mobile execution progress display) */
    label?: string;
    /** Node comment */
    comment?: string;
    /** Whether the node is locked */
    locked?: boolean;
    /** ABI input field → resolved binding */
    bindings: Record<string, FieldBinding>;
    /** Field that drives batch expansion (from sourceSpec batchOn). */
    batchField?: string;
    /**
     * ABI-derived output routes, one per non-meta output field. Multi-channel
     * nodes with multiple output handles may emit multiple routes;
     * each may carry its own `downstreamDataNodeId`.
     */
    outputs: OutputRoute[];
    /** IDs of upstream dependency nodes */
    dependencies: string[];
    /** Execution level (used to determine parallel execution groups) */
    level: number;
    /** Raw node configuration data (used for UI restoration) */
    rawConfig?: Record<string, unknown>;
}

/**
 * Data node definition (entry node that provides initial data)
 */
export interface DataNode {
    /** Node ID */
    id: string;
    /** Node type */
    type: string;
    /** Data type */
    dataType: "text" | "image" | "audio" | "video" | "model" | "file";
    /** Node display name (used for mobile execution progress display) */
    label?: string;
    /** Node comment (used for mobile execution progress display) */
    comment?: string;
    /** Whether this is a workflow input point */
    isInput: boolean;
    /** Input name (used to provide data at workflow execution time) */
    inputName?: string;
    /** Static data (if any) */
    staticData?: {
        texts?: string[];
        fileKeys?: string[];
    };
    /** Execution level */
    level: number;
}

/**
 * Workflow input definition
 */
export interface WorkflowInput {
    /** Input name */
    name: string;
    /** Input type */
    type:
        | "text"
        | "image"
        | "audio"
        | "video"
        | "model"
        | "file"
        | "text[]"
        | "file[]";
    /** Description */
    description?: string;
    /** Whether the input is required */
    required: boolean;
    /** Default value */
    defaultValue?: unknown;
    /** Associated node ID */
    nodeId: string;
}

/**
 * Workflow output definition
 */
export interface WorkflowOutput {
    /** Output name */
    name: string;
    /** Output type */
    type:
        | "text"
        | "image"
        | "audio"
        | "video"
        | "model"
        | "file"
        | "text[]"
        | "file[]";
    /** Source node ID */
    nodeId: string;
    /** Source field */
    field: string;
}

/**
 * Executable workflow definition
 */
export interface ExecutableWorkflow {
    /** Workflow name */
    name: string;
    /** Workflow description */
    description?: string;
    /** Version number */
    version: string;
    /** Export timestamp */
    exportedAt: string;
    /** Workflow input definitions */
    inputs: WorkflowInput[];
    /** Workflow output definitions */
    outputs: WorkflowOutput[];
    /** Data nodes (entry nodes) */
    dataNodes: DataNode[];
    /** Executable nodes (sorted by execution level) */
    executableNodes: ExecutableNode[];
    /** Execution levels (each level can execute in parallel) */
    executionLevels: string[][];
    /** Edge relationships between data nodes (used for input pass-through) */
    dataNodeEdges: Array<{ source: string; target: string }>;
    /** Original flow data (used for UI restoration) */
    originalFlow: {
        nodes: Node[];
        edges: Edge[];
    };
}

/* ========================================================================== */
/* Data node type mapping                                                       */
/* ========================================================================== */

/**
 * Data node type mapping
 */
export const DATA_NODE_TYPES: Record<
    string,
    { dataType: DataNode["dataType"]; outputField: "fileKeys" | "texts" }
> = {
    textNode: { dataType: "text", outputField: "texts" },
    imageNode: { dataType: "image", outputField: "fileKeys" },
    audioNode: { dataType: "audio", outputField: "fileKeys" },
    videoNode: { dataType: "video", outputField: "fileKeys" },
    modelNode: { dataType: "model", outputField: "fileKeys" },
    fileNode: { dataType: "file", outputField: "fileKeys" },
};
