import type { Node } from "@xyflow/react";

/* ========================================================================== */
/* Base Type Definitions                                                       */
/* ========================================================================== */

/**
 * Output node type
 */
export type OutputNodeType =
    | "textNode"
    | "imageNode"
    | "audioNode"
    | "videoNode"
    | "modelNode";

/**
 * Transfer node data structure
 * Contains feature, prompt, and output config; can be submitted directly to the backend for execution
 */
export interface TransferNodeData extends Record<string, unknown> {
    /** Feature identifier, corresponding to the backend API */
    feature: string;
    /** Execution parameters, submitted directly to the backend */
    prompt: Record<string, unknown>;
    /** Output node type, e.g. "audioNode", "videoNode", "textNode" */
    outputType?: OutputNodeType;
    /** Output data field: "fileKeys" or "texts" */
    outputField?: "fileKeys" | "texts";
}

/**
 * Compose node data structure
 * Contains feature, ids (connected nodes), and output config
 */
export interface ComposeNodeData extends Record<string, unknown> {
    /** Feature identifier, corresponding to the backend API */
    feature: string;
    /** List of upstream node IDs connected to this node */
    ids: string[];
    /** Output node type */
    outputType?: OutputNodeType;
    /** Output data field */
    outputField?: "fileKeys" | "texts";
}

/**
 * Base data structure for data nodes
 */
export interface DataNodeData extends Record<string, unknown> {
    /** Array of text values */
    texts?: string[];
    /** Array of file keys */
    fileKeys?: string[];
}

/* ========================================================================== */
/* BaseNode — Generic React Flow `data` shape (shared by plugin selector and execution) */
/* ========================================================================== */

/** Default `data` shape for nodes using BaseNode / plugin selector; concrete nodes can extend this interface */
export interface BaseNodeData extends Record<string, unknown> {
    feature?: string;
    prompt?: Record<string, unknown>;
    /** Currently selected plugin ID (registry `nodeSlot` → `pluginIds`) */
    pluginId?: string;
    pluginRepo?: string;
}

/* ========================================================================== */
/* Legacy type definitions (kept for backward compatibility)                   */
/* ========================================================================== */

export interface TextNodeData extends Record<string, unknown> {
    texts: string[];
}

export interface AddTextNodeData extends Record<string, unknown> {
    taskId?: string;
    query?: string;
    activeTab?: string;
    texts?: string[];
    locked?: boolean;
}

export interface GenTextNodeData extends Record<string, unknown> {
    prompt?: string;
    texts?: string[];
}

export interface BatchTask {
    feature: string;
    prompt: {
        text: string;
    };
    nodeId: string;
    data?: {
        text?: string;
    };
}

export type AddTextNode = Node<AddTextNodeData>;
export type TextNode = Node<TextNodeData>;
export type GenTextNode = Node<GenTextNodeData>;
