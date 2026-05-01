/**
 * Executable workflow definitions
 * Used to export workflow JSON that can be independently executed by the backend
 */

import type { Node, Edge } from "@xyflow/react";

/* ========================================================================== */
/* Type definitions                                                             */
/* ========================================================================== */

/**
 * Parameter source type
 */
export type ParamSource =
    | "static" // Static value; use value directly
    | "upstream" // From the output of an upstream node
    | "input" // User input (provided at workflow execution time)
    | "config"; // Node configuration item

/**
 * Parameter mapping definition
 */
export interface ParamMapping {
    /** Parameter source */
    source: ParamSource;
    /** Upstream node ID (required when source is "upstream") */
    nodeId?: string;
    /** Multiple upstream node IDs (used in collectAll mode) */
    nodeIds?: string[];
    /** Upstream node output field (required when source is "upstream"), e.g. "fileKeys[0]", "texts", "fileKeys" */
    field?: string;
    /** Static value (used when source is "static") */
    value?: unknown;
    /** Input parameter name (used when source is "input"; identifies the workflow input) */
    inputName?: string;
    /** Config field path (used when source is "config") */
    configPath?: string;
    /** Whether this is an array; if so, execution runs for each element */
    isArray?: boolean;
    /** Array index (if a specific element of the array is needed) */
    arrayIndex?: number;
    /** Transform function name (optional, e.g. "getFileUrl") */
    transform?: string;
    /** Incoming edge target handle (corresponds to canvas edge.targetHandle in multi-slot scenarios) */
    edgeTargetHandle?: string;
}

/**
 * Executable node definition
 */
export interface ExecutableNode {
    /** Node ID */
    id: string;
    /** Node type */
    type: string;
    /** Backend API feature identifier */
    feature: string;
    /** Node display name (used for mobile execution progress display) */
    label?: string;
    /** Node comment (used for mobile execution progress display) */
    comment?: string;
    /** Whether the node is locked (locked nodes cannot be edited during mobile execution) */
    locked?: boolean;
    /** Input parameter mapping */
    inputMapping: Record<string, ParamMapping>;
    /** Output type */
    outputType: string;
    /** Output field */
    outputField: "fileKeys" | "texts";
    /** Whether this is batch execution (executes separately for each element in the array) */
    isBatch?: boolean;
    /** Array parameter name for batch execution */
    batchParam?: string;
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
