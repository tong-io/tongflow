import type { Node, NodeProps } from "@xyflow/react";

import type { AspectRatio } from "@/constants/media-options";

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

/**
 * Shared React Flow `data` persisted on canvas nodes (media, composition, ABI workflow).
 * Modal primitives, transfer/compose plugins, and `TongflowPluginNodeData` all use this spine
 * so fields are readable without field-by-field `as` casts.
 */
export interface BaseNodeData extends Record<string, unknown> {
    feature?: string;
    prompt?: Record<string, unknown>;
    /** Currently selected plugin ID (registry `nodeSlot` → `pluginIds`) */
    pluginId?: string;

    /** Composition linkage (`useNodesData`) */
    ids?: string[];
    texts?: string[];
    fileKeys?: string[];

    selectedAspectRatio?: AspectRatio;
    selectedResolution?: unknown;
    infos?: unknown[];

    label?: string;
    comment?: string;
    locked?: boolean;

    /** Model / single-file modalities */
    fileName?: string;
    fileKey?: string;

    outputType?: OutputNodeType;
    outputField?: "fileKeys" | "texts";
}

/**
 * Typed `NodeProps` for any canvas node whose persisted `data` follows `BaseNodeData`.
 */
export type RfDataNodeProps<Type extends string = string> = NodeProps<
    Node<BaseNodeData, Type>
>;

export interface AddTextNodeData extends Record<string, unknown> {
    taskId?: string;
    query?: string;
    activeTab?: string;
    texts?: string[];
    locked?: boolean;
}
