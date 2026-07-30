/**
 * Undo/redo history helpers for the workflow canvas.
 *
 * The flow store keeps explicit past/future snapshot stacks and calls
 * commitHistory() at semantic boundaries (add node, drag start, ...).
 * These helpers are pure so they can be unit-tested in isolation.
 */

import type { Edge, Node } from "@xyflow/react";

export interface FlowSnapshot {
    nodes: Node[];
    edges: Edge[];
}

/** Maximum number of undoable entries kept in the past stack. */
export const HISTORY_LIMIT = 100;

/**
 * Deep-copy the current canvas state for the history stack, stripping
 * transient interaction flags so undo never restores a stale selection
 * or a mid-drag state.
 */
export function snapshotFlow(nodes: Node[], edges: Edge[]): FlowSnapshot {
    const snapshot = structuredClone({ nodes, edges });
    for (const node of snapshot.nodes) {
        delete node.selected;
        delete node.dragging;
    }
    return snapshot;
}

/** Append a snapshot to the past stack, dropping the oldest beyond the cap. */
export function pushSnapshot(
    past: FlowSnapshot[],
    snapshot: FlowSnapshot,
    limit: number = HISTORY_LIMIT,
): FlowSnapshot[] {
    const next = past.concat(snapshot);
    return next.length > limit ? next.slice(next.length - limit) : next;
}

// Focus generation counter: bumped on every global focus change so that
// form edits coalesce into one history entry per focus session — repeated
// updates() calls with the same source only commit again after focus moves.
let focusGeneration = 0;

export function bumpFocusGeneration(): void {
    focusGeneration++;
}

export function currentFocusGeneration(): number {
    return focusGeneration;
}
