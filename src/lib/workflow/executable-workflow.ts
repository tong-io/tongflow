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
 */
export type FieldBinding =
    | {
          kind: "handle";
          sources: { fromNodeId: string; fromField: string }[];
          /** RF target handle id (`in:<field>`). */
          targetHandle: string;
          /** True for batch / collect-all handles (multi-source allowed). */
          collect?: true;
      }
    | { kind: "config"; value: unknown }
    | { kind: "static"; value: unknown }
    | { kind: "input"; inputName: string };

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
    /** ABI-derived primary output channel (RF type, e.g. `imageNode`). */
    outputType: string;
    /** Output field name (`fileKeys` or `texts`). */
    outputField: "fileKeys" | "texts";
    /** IDs of upstream dependency nodes */
    dependencies: string[];
    /** Execution level (used to determine parallel execution groups) */
    level: number;
    /** Directly connected downstream data node ID (updated after execution completes) */
    downstreamDataNodeId?: string;
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
