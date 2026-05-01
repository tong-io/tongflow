/**
 * React Flow connection validation: matches by the node's "logical output type" against the upstream declarations in the target node's paramMappings.
 */

import type { Connection, Edge, Node } from "@xyflow/react";
import { DATA_NODE_TYPES } from "./executable-workflow";
import {
    getNodeExecutionConfig,
    type NodeExecutionConfig,
    type ParamMappingConfig,
} from "./node-execution-config";

/** Text-to-music node: style / lyrics input handles (each handle allows only one edge) */
export const TEXT_GEN_MUSIC_HANDLES = {
    style: "in:style",
    lyric: "in:lyric",
} as const;

const SINGLE_EDGE_TARGET_HANDLES = new Set<string>([
    TEXT_GEN_MUSIC_HANDLES.style,
    TEXT_GEN_MUSIC_HANDLES.lyric,
]);

/** Add node type → logical output type (consistent with workflow-exporter getAddNodeOutputType) */
const ADD_NODE_OUTPUT_TYPE: Record<string, string> = {
    addImageNode: "imageNode",
    addVideoNode: "videoNode",
    addAudioNode: "audioNode",
    addTextNode: "textNode",
    addModelNode: "modelNode",
    addFileNode: "fileNode",
    addLinkNode: "textNode",
};

function getNodeConfigFromData(
    nodeData: Record<string, unknown>,
): NodeExecutionConfig | undefined {
    const feature = nodeData.feature as string | undefined;
    const paramMappings = nodeData.paramMappings as
        | Record<string, ParamMappingConfig>
        | undefined;
    if (!feature || !paramMappings) return undefined;
    return {
        nodeType: "",
        feature,
        outputType: nodeData.outputType as string | undefined,
        outputField: nodeData.outputField as "fileKeys" | "texts" | undefined,
        paramMappings,
        supportsBatch: nodeData.supportsBatch as boolean | undefined,
        batchParam: nodeData.batchParam as string | undefined,
        label: nodeData.label as string | undefined,
    };
}

function getEffectiveNodeConfig(
    nodeType: string,
    nodeData: Record<string, unknown>,
): NodeExecutionConfig | undefined {
    return getNodeExecutionConfig(nodeType) ?? getNodeConfigFromData(nodeData);
}

/**
 * The "logical output type" of a source node: for data nodes it is their own type; for processing/Add nodes it uses outputType or the mapping.
 */
export function getEffectiveOutputType(
    nodeType: string | undefined,
    nodeData?: Record<string, unknown> | null,
): string | undefined {
    if (!nodeType) return undefined;
    if (nodeType in DATA_NODE_TYPES) return nodeType;
    if (nodeData?.outputType && typeof nodeData.outputType === "string") {
        return nodeData.outputType;
    }
    const fromAdd = ADD_NODE_OUTPUT_TYPE[nodeType];
    if (fromAdd) return fromAdd;
    const cfg = getNodeExecutionConfig(nodeType);
    return cfg?.outputType;
}

function collectUpstreamTypesFromConfig(
    config: NodeExecutionConfig,
): Set<string> {
    const out = new Set<string>();
    const mappings = config.paramMappings ?? {};
    for (const mapping of Object.values(mappings)) {
        for (const src of mapping.sources ?? []) {
            if (src.type === "upstream" && src.upstreamType) {
                out.add(src.upstreamType);
            }
        }
    }
    return out;
}

function normalizeTargetHandle(id: string | null | undefined): string {
    return id ?? "a";
}

/**
 * Check whether an incoming edge already occupies the same targetHandle (for single-slot handles such as in:style / in:lyric)
 */
export function hasDuplicateTargetHandle(
    edges: Edge[],
    connection: Connection,
): boolean {
    const th = connection.targetHandle;
    if (!th || !SINGLE_EDGE_TARGET_HANDLES.has(th)) return false;
    return edges.some(
        (e) =>
            e.target === connection.target &&
            normalizeTargetHandle(e.targetHandle) === th,
    );
}

/**
 * Validate whether a connection is allowed. Unknown configurations are allowed by default to prevent unregistered nodes from being unable to connect.
 */
export function isValidFlowConnection(
    connection: Connection,
    nodes: Node[],
    edges: Edge[],
): boolean {
    const source = connection.source;
    const target = connection.target;
    if (!source || !target || source === target) return false;

    if (hasDuplicateTargetHandle(edges, connection)) return false;

    const sourceNode = nodes.find((n) => n.id === source);
    const targetNode = nodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) return false;

    const sourceData = (sourceNode.data as Record<string, unknown>) ?? {};
    const targetData = (targetNode.data as Record<string, unknown>) ?? {};
    const outType = getEffectiveOutputType(sourceNode.type, sourceData);
    if (!outType) return true;

    const targetType = targetNode.type ?? "";

    // Data node as target: only accepts upstream whose "logical output type" matches its own type
    if (targetType in DATA_NODE_TYPES) {
        return outType === targetType;
    }

    // Text-to-music: semantic handles only accept text-type output
    if (targetType === "textGenMusicNode") {
        const th = connection.targetHandle;
        if (
            th === TEXT_GEN_MUSIC_HANDLES.style ||
            th === TEXT_GEN_MUSIC_HANDLES.lyric
        ) {
            return outType === "textNode";
        }
    }

    const cfg = getEffectiveNodeConfig(targetType, targetData);
    const allowed = cfg
        ? collectUpstreamTypesFromConfig(cfg)
        : new Set<string>();

    if (!cfg || allowed.size === 0) {
        return true;
    }

    return allowed.has(outType);
}
