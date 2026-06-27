/**
 * React Flow connection validation: logical output types, ABI schema checks,
 * and duplicate-edge rules for single-value (non-array) target handles.
 *
 * Manual edge creation is disabled in the UI (handles set `isConnectableStart`
 * to false); this validator runs when users *reconnect* an existing edge's
 * endpoint, so it must enforce the full ABI contract on the new endpoint.
 */

import type { Connection, Edge, Node } from "@xyflow/react";
import {
    parseTargetHandleId,
    targetHandleId,
} from "@/lib/abi/handle-introspect";
import { getAbiNodeRegistration } from "@/lib/abi/node-registry";
import { resolveSpec } from "@/lib/abi/resolve";
import type { FieldSourceOverride } from "@/lib/abi/sources";
import { tryAbiCompatibility } from "@/lib/workflow/connection-validator";
import { DATA_NODE_TYPES } from "./executable-workflow";
import {
    ADD_NODE_OUTPUT_TYPE,
    getEffectiveOutputType,
} from "./flow-connection-shared";

export {
    ADD_NODE_OUTPUT_TYPE,
    getEffectiveOutputType,
} from "./flow-connection-shared";

function resolveSpecForNode(targetNodeId: string) {
    const reg = getAbiNodeRegistration(targetNodeId);
    if (!reg) return undefined;
    return resolveSpec(
        reg.feature,
        reg.sourceSpec as Record<string, FieldSourceOverride> | undefined,
    );
}

/**
 * Target handles that accept only a single edge: every ABI handle field whose
 * plugin shape is a scalar (`!array`) and that isn't a batch/collect fan-in
 * (those legitimately receive multiple upstream values).
 */
function singleEdgeHandlesForTarget(targetNodeId: string): ReadonlySet<string> {
    const spec = resolveSpecForNode(targetNodeId);
    if (!spec) return new Set();
    const out = new Set<string>();
    for (const [field, f] of Object.entries(spec.fields)) {
        if (f.kind !== "handle") continue;
        if (f.array || f.batch || f.collect) continue;
        out.add(targetHandleId(field));
    }
    return out;
}

/** Modality (RF nodeType) that a specific ABI target handle expects, if resolvable. */
function expectedTargetHandleType(
    targetNodeId: string,
    targetHandle: string | null | undefined,
): string | undefined {
    const field = parseTargetHandleId(targetHandle);
    if (!field) return undefined;
    const spec = resolveSpecForNode(targetNodeId);
    if (!spec) return undefined;
    const f = spec.fields[field];
    return f?.kind === "handle" ? f.nodeType : undefined;
}

/** Set of upstream node types this target accepts on any handle. */
function collectUpstreamTypesForTarget(targetNodeId: string): Set<string> {
    const spec = resolveSpecForNode(targetNodeId);
    if (!spec) return new Set();
    const out = new Set<string>();
    for (const f of Object.values(spec.fields)) {
        if (f.kind === "handle") out.add(f.nodeType);
    }
    return out;
}

/**
 * Check whether an incoming edge already occupies the same targetHandle for
 * handles that only allow a single connection. `ignoreEdgeId` excludes the edge
 * currently being reconnected, so dragging an edge's source endpoint (target
 * handle unchanged) isn't rejected as a self-collision.
 */
export function hasDuplicateTargetHandle(
    edges: Edge[],
    connection: Connection,
    ignoreEdgeId?: string,
): boolean {
    const targetId = connection.target;
    if (!targetId) return false;
    const th = connection.targetHandle;
    if (!th) return false;
    const singleEdge = singleEdgeHandlesForTarget(targetId);
    if (!singleEdge.has(th)) return false;
    return edges.some(
        (e) =>
            e.id !== ignoreEdgeId &&
            e.target === targetId &&
            e.targetHandle === th,
    );
}

/**
 * Add nodes own a single out handle and represent one created asset, so their
 * output fans out to at most one downstream edge. `ignoreEdgeId` excludes the
 * edge being reconnected (so dragging its target endpoint isn't a self-collision).
 */
export function hasDuplicateAddSourceEdge(
    edges: Edge[],
    connection: Connection,
    sourceType: string | undefined,
    ignoreEdgeId?: string,
): boolean {
    if (!sourceType || !(sourceType in ADD_NODE_OUTPUT_TYPE)) return false;
    const sourceId = connection.source;
    if (!sourceId) return false;
    return edges.some((e) => e.id !== ignoreEdgeId && e.source === sourceId);
}

/**
 * Validate whether a connection is allowed. Unknown configurations are allowed
 * by default so unregistered or non-ABI nodes remain connectable.
 *
 * `ignoreEdgeId` is the edge being reconnected (excluded from duplicate checks).
 */
export function isValidFlowConnection(
    connection: Connection,
    nodes: Node[],
    edges: Edge[],
    ignoreEdgeId?: string,
): boolean {
    const source = connection.source;
    const target = connection.target;
    if (!source || !target || source === target) return false;

    if (hasDuplicateTargetHandle(edges, connection, ignoreEdgeId)) return false;

    const sourceNode = nodes.find((n) => n.id === source);
    const targetNode = nodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) return false;

    if (
        hasDuplicateAddSourceEdge(
            edges,
            connection,
            sourceNode.type,
            ignoreEdgeId,
        )
    ) {
        return false;
    }

    const outType = getEffectiveOutputType(
        sourceNode.id,
        sourceNode.type,
        connection.sourceHandle,
    );

    /** Must stay before ABI refinement (stricter behavioural guardrails). */
    if (!outType) return true;

    const sourceType = sourceNode.type ?? "";
    const targetType = targetNode.type ?? "";

    // Data node as target: only accepts upstream whose "logical output type"
    // matches its own type. Modality nodes are asset carriers, not transforms,
    // so they can't feed each other — reject modality → modality.
    if (targetType in DATA_NODE_TYPES) {
        if (sourceType in DATA_NODE_TYPES) return false;
        return outType === targetType;
    }

    // Modality gate: a resolvable ABI target handle dictates the exact upstream
    // modality. XRef/Asset schemas are isomorphic across media types, so the
    // schema-level check below cannot distinguish image/video/audio — enforce it here.
    const expected = expectedTargetHandleType(
        targetNode.id,
        connection.targetHandle,
    );
    if (expected && expected !== outType) return false;

    const abiDecision = tryAbiCompatibility(connection, nodes);
    if (abiDecision !== undefined) return abiDecision;

    const allowed = collectUpstreamTypesForTarget(targetNode.id);
    if (allowed.size === 0) return true;

    return allowed.has(outType);
}
