/**
 * React Flow connection validation: logical output types, ABI schema checks,
 * and optional duplicate-edge rules for single-slot text handles.
 */

import type { Connection, Edge, Node } from "@xyflow/react";
import { getAbiNodeRegistration } from "@/lib/abi/node-registry";
import {
    resolveSpec,
    singleEdgeTextScalarTargetHandles,
} from "@/lib/abi/resolve";
import type { FieldSourceOverride } from "@/lib/abi/sources";
import { tryAbiCompatibility } from "@/lib/workflow/connection-validator";
import { DATA_NODE_TYPES } from "./executable-workflow";
import { getEffectiveOutputType } from "./flow-connection-shared";

export {
    ADD_NODE_OUTPUT_TYPE,
    getEffectiveOutputType,
} from "./flow-connection-shared";

function singleEdgeHandlesForTarget(targetNodeId: string): ReadonlySet<string> {
    const reg = getAbiNodeRegistration(targetNodeId);
    if (!reg) return new Set();
    return new Set(
        singleEdgeTextScalarTargetHandles(
            reg.feature,
            reg.sourceSpec as Record<string, FieldSourceOverride>,
        ),
    );
}

/** Set of upstream node types this target accepts on any handle. */
function collectUpstreamTypesForTarget(targetNodeId: string): Set<string> {
    const reg = getAbiNodeRegistration(targetNodeId);
    if (!reg) return new Set();
    const spec = resolveSpec(
        reg.feature,
        reg.sourceSpec as Record<string, FieldSourceOverride> | undefined,
    );
    const out = new Set<string>();
    for (const f of Object.values(spec.fields)) {
        if (f.kind === "handle") out.add(f.nodeType);
    }
    return out;
}

/**
 * Check whether an incoming edge already occupies the same targetHandle for
 * handles that only allow a single connection (e.g. text-scalar `in:tags`).
 */
export function hasDuplicateTargetHandle(
    edges: Edge[],
    connection: Connection,
): boolean {
    const targetId = connection.target;
    if (!targetId) return false;
    const th = connection.targetHandle;
    if (!th) return false;
    const singleEdge = singleEdgeHandlesForTarget(targetId);
    if (!singleEdge.has(th)) return false;
    return edges.some((e) => e.target === targetId && e.targetHandle === th);
}

/**
 * Validate whether a connection is allowed. Unknown configurations are allowed
 * by default so unregistered or non-ABI nodes remain connectable.
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

    const outType = getEffectiveOutputType(
        sourceNode.id,
        sourceNode.type,
        connection.sourceHandle,
    );

    /** Must stay before ABI refinement (stricter behavioural guardrails). */
    if (!outType) return true;

    const targetType = targetNode.type ?? "";

    // Data node as target: only accepts upstream whose "logical output type" matches its own type
    if (targetType in DATA_NODE_TYPES) {
        return outType === targetType;
    }

    const abiDecision = tryAbiCompatibility(connection, nodes);
    if (abiDecision !== undefined) return abiDecision;

    const allowed = collectUpstreamTypesForTarget(targetNode.id);
    if (allowed.size === 0) return true;

    return allowed.has(outType);
}
