/**
 * Headless canvas model — the workflow document as a zustand (vanilla) store.
 *
 * Holds nodes / edges / workflow meta plus every graph mutation the product
 * defines (`addNode`, `expands`, `compose`, `updates`, `removeNode`,
 * `autoLayout`), undo/redo history, combo (multi-select) state and the
 * per-node compute registry. No React and no I/O: React Flow change
 * application (`applyNodeChanges` & co.) and persistence are host concerns —
 * a React host layers its RF callbacks on top of `createFlowSlice` and
 * subscribes to the store to persist; a Node host uses `createFlowStore`
 * directly and drives it through the agent tools.
 */

import type { Edge, Node } from "@xyflow/react";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
    resolvedSpecForNodeType,
    resolveEdgeHandles,
} from "../abi/node-feature-registry";
import { DATA_NODE_TYPES } from "../workflow/executable-workflow";
import {
    currentFocusGeneration,
    type FlowSnapshot,
    pushSnapshot,
    snapshotFlow,
} from "../workflow/flow-history";
import {
    componentsContaining,
    computeAutoLayout,
} from "../workflow/layout/auto-layout";
import { estimateNodeSize, H_GAP, V_GAP } from "../workflow/layout/node-dims";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface PossibleNode {
    type: string;
    data?: Record<string, unknown>;
}

export interface FlowWorkflowMeta {
    id: number | null;
    name: string;
    description: string;
}

export interface FlowCoreState {
    nodes: Node[];
    edges: Edge[];
    workflowName: string;
    workflowId: number | null;
    workflowDescription: string;

    /** Nodes currently selected on the canvas (host-fed). */
    selectedNodes: Node[];
    setSelectedNodes: (nodes: Node[]) => void;

    // Combo (multi-select compose) helpers
    comboMode: boolean;
    comboSelectedIds: Set<string>;
    setComboMode: (enabled: boolean) => void;
    isInCombo: (id: string) => boolean;
    toggleCombo: (id: string) => void;
    clearCombo: () => void;

    setWorkflowName: (name: string) => void;
    setWorkflowId: (id: number | null) => void;
    setWorkflowDescription: (description: string) => void;

    computeMap: Map<string, () => void>;
    registerCompute: (id: string, fn: () => void) => void;
    getCompute: (id: string) => (() => void) | undefined;

    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    /** Id of the edge currently being reconnected (excluded from validation). */
    reconnectingEdgeId: string | null;
    setReconnectingEdgeId: (id: string | null) => void;

    /**
     * Spawn (or reuse) downstream data nodes for `nodeId`, one per entry of
     * `possibleNodes`, wired with the canonical handles. Returns the ids in
     * `possibleNodes` order (existing siblings are reused first).
     */
    expands: (nodeId: string | null, possibleNodes: PossibleNode[]) => string[];
    /** Create a node fed by every combo-selected node; returns the new id. */
    /**
     * Create a node from the combo selection and wire every selected node into
     * it. `sourceOrder` overrides the selection order used to assign handles
     * (sources are matched to target fields in ABI input order).
     */
    compose: (newNode: {
        type: string;
        data: unknown;
        sourceOrder?: string[];
    }) => string;
    /** Replace a node's `data`. `history: false` skips the undo snapshot. */
    updates: (
        nodeId: string,
        data: Record<string, unknown>,
        opts?: { history?: boolean },
    ) => void;
    addNode: (
        node: PossibleNode,
        position?: { x: number; y: number },
    ) => string;
    removeNode: (nodeId: string) => void;
    /** Drop every edge touching one of `nodeIds` (after a host removed them). */
    pruneEdgesOf: (nodeIds: string[]) => void;

    /**
     * Tidy the canvas (or just the weakly-connected components containing
     * `seedIds`) into a layered layout. Returns true when anything moved.
     * `history: false` folds the move into the caller's own snapshot.
     */
    autoLayout: (seedIds?: string[], opts?: { history?: boolean }) => boolean;
    /**
     * Layout settle watcher hooks for the host: a user drag cancels any pending
     * re-tidy; a late dimension change inside a just-tidied scope re-runs that
     * layout without a new history entry.
     */
    cancelLayoutSettleWatch: () => void;
    notifyNodesMeasured: (nodeIds: string[]) => void;

    // Undo/redo history (snapshots of { nodes, edges })
    historyPast: FlowSnapshot[];
    historyFuture: FlowSnapshot[];
    /**
     * Snapshot the current state onto the past stack and clear the future
     * stack. Commits with the same `source` coalesce while focus stays put.
     */
    commitHistory: (source?: string) => void;
    /** Break coalescing so the next commit with the same source starts fresh. */
    resetHistoryCoalescing: () => void;
    undo: () => void;
    redo: () => void;
    clearHistory: () => void;

    // Node-created listeners
    nodeCreatedCallbacks: Set<(nodeIds: string[]) => void>;
    onNodeCreated: (callback: (nodeIds: string[]) => void) => () => void;
}

export interface FlowStoreOptions {
    /** Initial document. */
    initial?: Partial<
        Pick<
            FlowCoreState,
            | "nodes"
            | "edges"
            | "workflowName"
            | "workflowId"
            | "workflowDescription"
        >
    >;
    /** Id factory (defaults to `crypto.randomUUID`). */
    createId?: () => string;
    /** Clock (defaults to `Date.now`); injectable for tests. */
    now?: () => number;
}

export type FlowStore = StoreApi<FlowCoreState>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isDataNode(nodeType: string): boolean {
    return nodeType in DATA_NODE_TYPES;
}

function defaultCreateId(): string {
    return globalThis.crypto.randomUUID();
}

/**
 * Append `edge` unless an identical connection (source/target/handles) already
 * exists — the same dedupe React Flow's `addEdge` performs.
 */
export function addEdgeIfAbsent(edge: Edge, edges: Edge[]): Edge[] {
    const dup = edges.some(
        (e) =>
            e.source === edge.source &&
            e.target === edge.target &&
            (e.sourceHandle ?? null) === (edge.sourceHandle ?? null) &&
            (e.targetHandle ?? null) === (edge.targetHandle ?? null),
    );
    return dup ? edges : edges.concat(edge);
}

function createDebounce<T extends unknown[]>(
    callback: (...args: T) => void,
    delay: number,
) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return (...args: T) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            callback(...args);
            timeoutId = null;
        }, delay);
    };
}

// Settle watcher: after an auto-layout, media nodes may still re-measure
// asynchronously (image/video loads change their width). For a short window
// we re-run the same scoped layout on dimension changes so the tidy result
// doesn't go stale — but any user drag cancels the watch immediately so a
// layout can never fight a manual arrangement.
const LAYOUT_SETTLE_WINDOW_MS = 1500;

/* ------------------------------------------------------------------ */
/* Slice                                                               */
/* ------------------------------------------------------------------ */

type SetState = StoreApi<FlowCoreState>["setState"];
type GetState = StoreApi<FlowCoreState>["getState"];

/**
 * The core state + actions as a zustand slice, so a host can compose it with
 * its own bindings (`create<FlowCoreState & Extra>()((set, get) => ({
 * ...createFlowSlice(set, get), ...extra }))`).
 */
export function createFlowSlice(
    set: SetState,
    get: GetState,
    options: FlowStoreOptions = {},
): FlowCoreState {
    const createId = options.createId ?? defaultCreateId;
    const now = options.now ?? Date.now;

    // Coalescing tracker for history commits: repeated commits with the same
    // source are skipped while the focused element stays the same, so a
    // typing burst in one form field becomes a single undo entry.
    const lastCommit = { source: "", focusGen: -1 };
    const resetCommitTracker = () => {
        lastCommit.source = "";
        lastCommit.focusGen = -1;
    };

    const layoutSettleWatch: { scope: Set<string> | null; until: number } = {
        scope: null,
        until: 0,
    };
    const cancelLayoutSettleWatch = () => {
        layoutSettleWatch.scope = null;
        layoutSettleWatch.until = 0;
    };
    const debouncedSettleRelayout = createDebounce(
        (run: () => void) => run(),
        300,
    );

    return {
        nodes: options.initial?.nodes ?? [],
        edges: options.initial?.edges ?? [],
        workflowName: options.initial?.workflowName ?? "",
        workflowId: options.initial?.workflowId ?? null,
        workflowDescription: options.initial?.workflowDescription ?? "",
        comboMode: false,
        comboSelectedIds: new Set<string>(),
        reconnectingEdgeId: null,

        autoLayout: (seedIds, opts) => {
            const { nodes, edges } = get();
            const scope =
                seedIds && seedIds.length > 0
                    ? componentsContaining(seedIds, nodes, edges)
                    : undefined;
            const moved = computeAutoLayout(nodes, edges, { scope });
            if (moved.size === 0) return false;

            if (opts?.history !== false) {
                get().commitHistory("layout");
                // Break coalescing so the next tidy gets its own undo entry
                // (same pattern as the remove path).
                queueMicrotask(resetCommitTracker);
            }

            const newNodes = get().nodes.map((n) => {
                const pos = moved.get(n.id);
                return pos ? { ...n, position: pos } : n;
            });
            set({ nodes: newNodes });

            // Watch for late media re-measures within this scope and re-tidy
            // without a new history entry; user drags cancel the watch.
            layoutSettleWatch.scope =
                scope ?? new Set(newNodes.map((n) => n.id));
            layoutSettleWatch.until = now() + LAYOUT_SETTLE_WINDOW_MS;
            return true;
        },
        cancelLayoutSettleWatch,
        notifyNodesMeasured: (nodeIds) => {
            const watched = layoutSettleWatch.scope;
            if (!watched) return;
            if (now() >= layoutSettleWatch.until) {
                cancelLayoutSettleWatch();
                return;
            }
            if (!nodeIds.some((id) => watched.has(id))) return;
            debouncedSettleRelayout(() => {
                if (
                    layoutSettleWatch.scope === watched &&
                    now() < layoutSettleWatch.until + LAYOUT_SETTLE_WINDOW_MS
                ) {
                    get().autoLayout([...watched], { history: false });
                }
            });
        },

        historyPast: [],
        historyFuture: [],
        commitHistory: (source) => {
            const focusGen = currentFocusGeneration();
            if (
                source &&
                source === lastCommit.source &&
                focusGen === lastCommit.focusGen
            ) {
                // Same source within the same focus session — coalesce
                return;
            }
            lastCommit.source = source ?? "";
            lastCommit.focusGen = focusGen;
            const { nodes, edges, historyPast } = get();
            set({
                historyPast: pushSnapshot(
                    historyPast,
                    snapshotFlow(nodes, edges),
                ),
                historyFuture: [],
            });
        },
        resetHistoryCoalescing: resetCommitTracker,
        undo: () => {
            const { historyPast, historyFuture, nodes, edges } = get();
            const previous = historyPast[historyPast.length - 1];
            if (!previous) return;
            resetCommitTracker();
            set({
                nodes: previous.nodes,
                edges: previous.edges,
                historyPast: historyPast.slice(0, -1),
                historyFuture: historyFuture.concat(snapshotFlow(nodes, edges)),
                selectedNodes: [],
                comboMode: false,
                comboSelectedIds: new Set(),
            });
        },
        redo: () => {
            const { historyPast, historyFuture, nodes, edges } = get();
            const next = historyFuture[historyFuture.length - 1];
            if (!next) return;
            resetCommitTracker();
            set({
                nodes: next.nodes,
                edges: next.edges,
                historyPast: pushSnapshot(
                    historyPast,
                    snapshotFlow(nodes, edges),
                ),
                historyFuture: historyFuture.slice(0, -1),
                selectedNodes: [],
                comboMode: false,
                comboSelectedIds: new Set(),
            });
        },
        clearHistory: () => {
            resetCommitTracker();
            set({ historyPast: [], historyFuture: [] });
        },

        nodeCreatedCallbacks: new Set(),
        onNodeCreated: (callback) => {
            const callbacks = get().nodeCreatedCallbacks;
            callbacks.add(callback);
            // Caller receives an unsubscribe closure
            return () => {
                callbacks.delete(callback);
            };
        },

        computeMap: new Map(),
        registerCompute: (id, fn) => {
            const map = new Map(get().computeMap);
            map.set(id, fn);
            set({ computeMap: map });
        },
        getCompute: (id) => get().computeMap.get(id),

        selectedNodes: [],
        setSelectedNodes: (nodes) => set({ selectedNodes: nodes }),

        setNodes: (nodes) => set({ nodes }),
        setEdges: (edges) => set({ edges }),
        setReconnectingEdgeId: (id) => set({ reconnectingEdgeId: id }),
        pruneEdgesOf: (nodeIds) => {
            if (nodeIds.length === 0) return;
            const idSet = new Set(nodeIds);
            set({
                edges: get().edges.filter(
                    (e) => !idSet.has(e.source) && !idSet.has(e.target),
                ),
            });
        },
        updates: (nodeId, data, opts) => {
            if (opts?.history !== false) {
                get().commitHistory(`update:${nodeId}`);
            }
            set({
                nodes: get().nodes.map((node) =>
                    node.id === nodeId ? { ...node, data } : node,
                ),
            });
        },
        addNode: (node, position) => {
            get().commitHistory();
            const { nodes } = get();

            let defaultX = 100;
            let defaultY = 100;

            if (position) {
                defaultX = position.x;
                defaultY = position.y;
            } else if (nodes.length > 0) {
                // Spawn to the far right when the canvas already has nodes.
                // position.x is the node CENTER (origin [0.5, 0.5]), so the
                // right edge is x + width/2; the gap accounts for both widths.
                const rightEdge = (n: Node) =>
                    n.position.x + estimateNodeSize(n).w / 2;
                const rightmostNode = nodes.reduce((rightmost, current) =>
                    rightEdge(current) > rightEdge(rightmost)
                        ? current
                        : rightmost,
                );

                defaultX =
                    rightEdge(rightmostNode) +
                    H_GAP +
                    estimateNodeSize({ type: node.type }).w / 2;
                defaultY = rightmostNode.position.y;
            }

            const nodeId = createId();
            const newNode: Node = {
                id: nodeId,
                type: node.type,
                position: { x: defaultX, y: defaultY },
                origin: [0.5, 0.5],
                data: node?.data ?? {},
            };
            set({ nodes: nodes.concat(newNode) });
            // Notify canvas listeners that a node was inserted
            get().nodeCreatedCallbacks.forEach((cb) => cb([nodeId]));
            return nodeId;
        },
        removeNode: (nodeId) => {
            get().commitHistory();
            const { nodes, edges } = get();
            set({
                nodes: nodes.filter((node) => node.id !== nodeId),
                edges: edges.filter(
                    (edge) => edge.source !== nodeId && edge.target !== nodeId,
                ),
            });
        },

        expands: (nodeId, possibleNodes) => {
            const { nodes } = get();
            let { edges } = get();
            const currNode = nodes.find((node) => node.id === nodeId);
            if (!currNode) {
                return [];
            }
            get().commitHistory();

            // Track whether upstream node emits persistent artifacts
            const sourceIsDataNode = isDataNode(currNode.type ?? "");

            // Locate existing downstream nodes via outgoing edges
            const existingChildEdges = edges.filter(
                (edge) => edge.source === currNode.id,
            );
            const existingChildNodes = existingChildEdges
                .map((edge) => nodes.find((n) => n.id === edge.target))
                .filter(Boolean) as Node[];

            // Bucket existing downstream siblings by Flow type. Multiple
            // same-type siblings are kept in edge order so caller can request
            // N-of-same-type expansion (e.g. ABI `x-expand-each` arrays) and
            // we reuse the first N in order, spawning more only when the new
            // batch is larger.
            const existingChildrenByType = new Map<string, Node[]>();
            if (!sourceIsDataNode) {
                for (const child of existingChildNodes) {
                    if (!child.type) continue;
                    const bucket = existingChildrenByType.get(child.type);
                    if (bucket) bucket.push(child);
                    else existingChildrenByType.set(child.type, [child]);
                }
            }
            // Cursor per type tracking how many same-type siblings we've consumed.
            const reuseCursorByType = new Map<string, number>();

            const { position } = currNode;
            const ids: string[] = [];
            const newNodes: Node[] = [];
            const newlyCreatedIds: string[] = [];
            let updatedNodes = [...nodes];

            // Count how many will be freshly created so vertical layout
            // centers only the new ones around the parent (existing ones keep
            // position).
            const nodesToCreate = possibleNodes.filter(({ type }) => {
                const available = existingChildrenByType.get(type)?.length ?? 0;
                const cursor = reuseCursorByType.get(type) ?? 0;
                if (cursor < available) {
                    reuseCursorByType.set(type, cursor + 1);
                    return false;
                }
                return true;
            });
            // Reset cursors for the real loop below — the filter pass above
            // only consumed them to compute how many fresh nodes we'll spawn.
            reuseCursorByType.clear();

            // All nodes are center-anchored (origin [0.5, 0.5]): a constant
            // edge-to-edge gap needs both the parent's and each child's width.
            const parentHalfW = estimateNodeSize(currNode).w / 2;
            const freshSizes = nodesToCreate.map((n) => estimateNodeSize(n));
            const totalH =
                freshSizes.reduce((sum, s) => sum + s.h, 0) +
                V_GAP * Math.max(0, freshSizes.length - 1);

            // Vertical cursor: stack fresh children below the lowest existing
            // child (repeated expands on one parent must not pile up on the
            // same point), otherwise center the stack on the parent.
            let yCursor: number;
            if (existingChildNodes.length > 0) {
                const lowestBottom = Math.max(
                    ...existingChildNodes.map(
                        (child) =>
                            child.position.y + estimateNodeSize(child).h / 2,
                    ),
                );
                yCursor = lowestBottom + V_GAP;
            } else {
                yCursor = position.y - totalH / 2;
            }

            let newNodeIndex = 0;
            for (const { type, data = {} } of possibleNodes) {
                const bucket = existingChildrenByType.get(type);
                const cursor = reuseCursorByType.get(type) ?? 0;
                const existingChild =
                    bucket && cursor < bucket.length
                        ? bucket[cursor]
                        : undefined;
                if (existingChild) reuseCursorByType.set(type, cursor + 1);

                if (existingChild) {
                    // Reuse sibling data node shell; merge payloads
                    ids.push(existingChild.id);
                    updatedNodes = updatedNodes.map((node) => {
                        if (node.id === existingChild.id) {
                            return {
                                ...node,
                                data: { ...node.data, ...data },
                            };
                        }
                        return node;
                    });
                } else {
                    // Instantiate a fresh downstream node plus edge bridge
                    const newNodeId = createId();
                    ids.push(newNodeId);
                    newlyCreatedIds.push(newNodeId);
                    const edgeId = createId();

                    const size = freshSizes[newNodeIndex];
                    newNodes.push({
                        id: newNodeId,
                        type: type,
                        position: {
                            x: position.x + parentHalfW + H_GAP + size.w / 2,
                            y: yCursor + size.h / 2,
                        },
                        origin: [0.5, 0.5],
                        data,
                    });
                    yCursor += size.h + V_GAP;

                    const { sourceHandle, targetHandle } = resolveEdgeHandles({
                        sourceType: currNode.type,
                        targetType: type,
                        targetSpec: resolvedSpecForNodeType(type),
                    });

                    edges = addEdgeIfAbsent(
                        {
                            id: edgeId,
                            source: `${currNode.id}`,
                            target: newNodeId,
                            type: "custom-edge",
                            ...(sourceHandle ? { sourceHandle } : {}),
                            ...(targetHandle ? { targetHandle } : {}),
                        },
                        edges,
                    );

                    newNodeIndex++;
                }
            }

            const allNodes = updatedNodes.concat(newNodes);
            set({
                nodes: allNodes,
                edges: [...edges],
            });
            // Announce only the brand-new node ids
            if (newlyCreatedIds.length > 0) {
                get().nodeCreatedCallbacks.forEach((cb) => cb(newlyCreatedIds));
            }
            return ids;
        },
        compose: ({ type, data, sourceOrder }) => {
            get().commitHistory();
            const { comboSelectedIds, nodes, edges } = get();
            const nodeId = createId();

            // Bounding volume of the multi-select set
            const positions = Array.from(comboSelectedIds)
                .map((id) => {
                    const node = nodes.find((n) => n.id === id);
                    if (!node) return null;
                    const size = estimateNodeSize(node);
                    return {
                        x: node.position.x,
                        y: node.position.y,
                        width: size.w,
                        height: size.h,
                    };
                })
                .filter(
                    (
                        pos,
                    ): pos is {
                        x: number;
                        y: number;
                        width: number;
                        height: number;
                    } => pos !== null,
                );

            // Right edge uses center.x + half width (origin [0.5, 0.5])
            const rightmostX = Math.max(
                ...positions.map((pos) => pos.x + pos.width / 2),
            );

            // Stack selection around the shared vertical midpoint
            const minY = Math.min(
                ...positions.map((pos) => pos.y - pos.height / 2),
            );
            const maxY = Math.max(
                ...positions.map((pos) => pos.y + pos.height / 2),
            );
            const centerY = (minY + maxY) / 2;

            // Place composed node to the right, vertically centered on
            // selection; account for the new node's own width (center-anchored).
            const newNode: Node = {
                id: nodeId,
                type: type,
                position: {
                    x: rightmostX + H_GAP + estimateNodeSize({ type }).w / 2,
                    y: centerY, // Already node-center coordinates
                },
                origin: [0.5, 0.5],
                data: (data ?? {}) as Record<string, unknown>,
            };

            // Track target handles already chosen on this new node so
            // multi-source combos (e.g. video + image) wire to distinct handle
            // fields instead of all stacking on the same handle.
            const usedTargetHandles = new Set<string>();
            const orderedIds = sourceOrder
                ? [
                      ...sourceOrder.filter((id) => comboSelectedIds.has(id)),
                      ...Array.from(comboSelectedIds).filter(
                          (id) => !sourceOrder.includes(id),
                      ),
                  ]
                : Array.from(comboSelectedIds);
            const newEdges: Edge[] = orderedIds
                .map((id) => {
                    const node = nodes.find((n) => n.id === id);
                    if (!node) return null;
                    const { sourceHandle, targetHandle } = resolveEdgeHandles({
                        sourceType: node.type,
                        targetType: type,
                        usedTargetHandles,
                        targetSpec: resolvedSpecForNodeType(type),
                    });
                    if (targetHandle) usedTargetHandles.add(targetHandle);
                    return {
                        id: createId(),
                        source: `${node.id}`,
                        target: nodeId,
                        type: "custom-edge",
                        ...(sourceHandle ? { sourceHandle } : {}),
                        ...(targetHandle ? { targetHandle } : {}),
                    };
                })
                .filter(Boolean) as Edge[];

            set({
                nodes: nodes.concat([newNode]),
                edges: edges.concat(newEdges),
            });
            get().clearCombo();
            // Same notification path as addNode
            get().nodeCreatedCallbacks.forEach((cb) => cb([nodeId]));
            return nodeId;
        },

        setComboMode: (enabled) => {
            if (!enabled) {
                // Fresh Set bumps referential equality
                set({ comboMode: false, comboSelectedIds: new Set() });
            } else {
                set({ comboMode: true }); // Preserve combo selection refs
            }
        },
        isInCombo: (id) => get().comboSelectedIds.has(id),
        toggleCombo: (id) => {
            const next = new Set(get().comboSelectedIds);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            set({
                comboSelectedIds: next,
                comboMode: next.size > 0, // Auto toggle combo UX
            });
        },
        clearCombo: () =>
            set({ comboMode: false, comboSelectedIds: new Set() }),

        setWorkflowName: (name) => set({ workflowName: name }),
        setWorkflowId: (id) => set({ workflowId: id }),
        setWorkflowDescription: (description) =>
            set({ workflowDescription: description }),
    };
}

/** Standalone headless store (Node hosts, tests). */
export function createFlowStore(options: FlowStoreOptions = {}): FlowStore {
    return createStore<FlowCoreState>()((set, get) =>
        createFlowSlice(set, get, options),
    );
}
