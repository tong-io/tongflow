/**
 * React Flow connection validation: matches by the node's "logical output type" against the upstream declarations in the target node's paramMappings.
 */

import type { Connection, Edge, Node } from "@xyflow/react";
import { tryAbiCompatibility } from "@/lib/connection-validator";
import { DATA_NODE_TYPES } from "./executable-workflow";
import type { NodeExecutionConfig } from "./node-execution-config";
import {
    getEffectiveNodeConfig,
    getEffectiveOutputType,
    normalizeFlowTargetHandle,
} from "./flow-connection-shared";

export {
    ADD_NODE_OUTPUT_TYPE,
    getEffectiveOutputType,
    getEffectiveNodeConfig,
    normalizeFlowTargetHandle,
} from "./flow-connection-shared";

/** Text-to-music node: style / lyrics input handles (each handle allows only one edge) */
export const TEXT_GEN_MUSIC_HANDLES = {
    style: "in:style",
    lyric: "in:lyric",
} as const;

const SINGLE_EDGE_TARGET_HANDLES = new Set<string>([
    TEXT_GEN_MUSIC_HANDLES.style,
    TEXT_GEN_MUSIC_HANDLES.lyric,
]);

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
            normalizeFlowTargetHandle(e.targetHandle) === th,
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

    /** Must stay before ABI refinement (stricter behavioural guardrails). */
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

    const abiDecision = tryAbiCompatibility(connection, nodes);
    if (abiDecision !== undefined) return abiDecision;

    const cfg = getEffectiveNodeConfig(targetType, targetData);
    const allowed = cfg
        ? collectUpstreamTypesFromConfig(cfg)
        : new Set<string>();

    if (!cfg || allowed.size === 0) {
        return true;
    }

    return allowed.has(outType);
}
