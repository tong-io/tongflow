/**
 * Node execution configuration type definitions
 * Every node component should export its own execution configuration
 */

import type { ParamSource } from "./executable-workflow";
import { logger } from "@/lib/logger";

/**
 * Parameter mapping definition (simplified version for self-contained node configuration)
 */
export interface ParamSourceConfig {
    /** Parameter source priority */
    type: ParamSource;
    /** Upstream node type (when type is "upstream") */
    upstreamType?: string;
    /** Upstream field */
    upstreamField?: string;
    /** Config path */
    configPath?: string;
    /** Input name (when type is "input") */
    inputName?: string;
    /** Whether URL transformation is needed */
    needsUrlTransform?: boolean;
    /** Whether to collect data from all matching upstream nodes (used for Compose nodes) */
    collectAll?: boolean;
    /** Handle id on the target node (matches incoming edge targetHandle for multi-slot same-type inputs) */
    targetHandle?: string;
    /** Default value */
    defaultValue?: unknown;
}

/**
 * Parameter mapping configuration
 */
export interface ParamMappingConfig {
    /** List of parameter source priorities */
    sources: ParamSourceConfig[];
    /** Whether the parameter is required */
    required?: boolean;
}

/**
 * Upstream data getter type
 * Used to retrieve upstream node data in real time during execution
 */
export type UpstreamDataGetter = (
    upstreamType: string,
    field: string,
) => unknown;

/**
 * Get all upstream data matching a given type
 */
export type AllUpstreamDataGetter = (
    upstreamType: string,
    field: string,
) => unknown[];

/**
 * Context parameter for the getPrompts function
 */
export type UpstreamDataByTargetHandleGetter = (
    targetHandle: string,
    upstreamType: string,
    field: string,
) => unknown;

export interface GetPromptsContext {
    /** Get data from a single upstream node */
    getUpstreamData: UpstreamDataGetter;
    /** Get data from all upstream nodes matching a given type (merged into an array) */
    getAllUpstreamData: AllUpstreamDataGetter;
    /** Get a single upstream by target handle (multi-slot same type, e.g. style/lyrics) */
    getUpstreamDataForTargetHandle?: UpstreamDataByTargetHandleGetter;
}

/**
 * Node execution configuration
 * Every executable node component should export this configuration
 */
export interface NodeExecutionConfig {
    /** Node type name (must match the type registered by the component) */
    nodeType: string;
    /** Backend feature name */
    feature: string;
    /** Node label (used to identify the node in workflow exports) */
    label?: string;
    /** Node display name (used for the Header title and mobile execution progress display) */
    title?: string;
    /** Node icon (used in the Header display) */
    icon?: React.ReactNode;
    /** Custom Header Actions (displayed before the menu button) */
    headerActions?: React.ReactNode;
    /** Execute button text, defaults to "Execute" */
    executeLabel?: string;
    /** Execute button icon */
    executeIcon?: React.ReactNode;
    /** Whether the execute button is disabled */
    executeDisabled?: boolean;
    /**
     * Function to get execution parameters
     * Returns an array of prompts; each prompt creates a task
     * If an empty array is returned, no execution happens
     *
     * @param context Context containing functions for fetching upstream data
     *   - getUpstreamData(type, field): get data from a single upstream node
     *   - getAllUpstreamData(type, field): get data from all upstream nodes matching a given type
     *
     * @example
     * ```ts
     * getPrompts: (ctx) => {
     *   // Get the latest fileKeys from the upstream audioNode
     *   const fileKeys = ctx?.getAllUpstreamData("audioNode", "fileKeys") as string[];
     *   return fileKeys.map(key => ({ fileKey: key }));
     * }
     * ```
     */
    getPrompts?: (context?: GetPromptsContext) => Record<string, unknown>[];
    /**
     * Custom task update handler (optional)
     * Used for scenarios such as streaming output that require responding to intermediate states
     * If provided, it is called on every task update (including streaming, completed, and failed)
     * Returning true indicates the event was handled; default logic will not run
     */
    onTaskUpdate?: (task: any) => boolean | void | Promise<boolean | void>;
    /** Output type (corresponds to the data node type) */
    outputType?: string;
    /** Output field */
    outputField?: "fileKeys" | "texts";
    /**
     * Ordered `outputs.properties` keys to try when narrowing producer schema for ABI edge checks.
     * Falls back to built-in heuristics when omitted (see `connection-validator`).
     */
    abiProducerPropertyCandidates?: readonly string[];
    /** Parameter mapping definition */
    paramMappings?: Record<string, ParamMappingConfig>;
    /** Whether batch execution is supported */
    supportsBatch?: boolean;
    /** Parameter name for batch execution */
    batchParam?: string;
    /**
     * Whether this is an input node (start node)
     * e.g. add-image, add-text, and other nodes without upstream dependencies
     * When set to true, the execute button (e.g. upload, add) is also shown in execution mode
     */
    isInputNode?: boolean;

    /**
     * Handle auto-rendering control.
     * - `undefined` (default): render standard target("a", Left) + source("b", Right)
     * - `false`: BaseNode does NOT render any handles (node provides its own)
     */
    handles?: false;

    /**
     * Whether BaseNode should auto-render `<NodePluginIdSelect>`.
     * - `undefined` / `true` (default): render when pluginOptions exist
     * - `false`: skip (e.g. node provides its own implementation picker)
     */
    showPluginSelect?: boolean;
}

/**
 * Node execution configuration registry
 * Used to collect the execution configuration for all nodes
 */
const nodeExecutionConfigRegistry = new Map<string, NodeExecutionConfig>();

/**
 * Register node execution configuration
 * Note: In React Strict Mode, effects run twice, so duplicate registration of the same config is expected
 */
export function registerNodeExecutionConfig(config: NodeExecutionConfig): void {
    const existing = nodeExecutionConfigRegistry.get(config.nodeType);
    // If an identical config already exists, skip it (React Strict Mode causes duplicate registration)
    if (existing && existing.feature === config.feature) {
        return;
    }
    if (existing) {
        logger.warn(
            `[NodeExecutionConfig] Overwriting config for node type: ${config.nodeType}`,
        );
    }
    nodeExecutionConfigRegistry.set(config.nodeType, config);
}

/**
 * Get a node execution configuration
 */
export function getNodeExecutionConfig(
    nodeType: string,
): NodeExecutionConfig | undefined {
    return nodeExecutionConfigRegistry.get(nodeType);
}

/**
 * Get all registered node execution configurations
 */
export function getAllNodeExecutionConfigs(): Map<string, NodeExecutionConfig> {
    return nodeExecutionConfigRegistry;
}

/**
 * Check whether a node type has been registered
 */
export function hasNodeExecutionConfig(nodeType: string): boolean {
    return nodeExecutionConfigRegistry.has(nodeType);
}

/* ========================================================================== */
/* Convenience configuration builders                                           */
/* ========================================================================== */

/**
 * Create an upstream parameter configuration
 */
export function upstreamParam(
    upstreamType: string,
    upstreamField: string,
    options?: {
        needsUrlTransform?: boolean;
        collectAll?: boolean;
        targetHandle?: string;
    },
): ParamSourceConfig {
    return {
        type: "upstream",
        upstreamType,
        upstreamField,
        needsUrlTransform: options?.needsUrlTransform,
        collectAll: options?.collectAll,
        targetHandle: options?.targetHandle,
    };
}

/**
 * Create a config parameter
 */
export function configParam(
    configPath: string,
    defaultValue?: unknown,
): ParamSourceConfig {
    return {
        type: "config",
        configPath,
        defaultValue,
    };
}

/**
 * Create a static parameter
 */
export function staticParam(value: unknown): ParamSourceConfig {
    return {
        type: "static",
        defaultValue: value,
    };
}

/**
 * Create an input parameter
 */
export function inputParam(inputName: string): ParamSourceConfig {
    return {
        type: "input",
        inputName,
    };
}
