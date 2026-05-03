/**
 * React Flow state wrapper built on Zustand.
 * Tracks node/edge lists and persisted workflow meta.
 */

import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Edge,
    type Node,
    type OnConnect,
    type OnEdgesChange,
    type OnNodesChange,
    type OnSelectionChangeFunc,
} from "@xyflow/react";
import { v4 } from "uuid";
import { create } from "zustand";
import { DATA_NODE_TYPES } from "@/utils/executable-workflow";
import { migrateWorkflowNodes } from "@/utils/migrate-workflow-nodes";

// True when React Flow reports a persisted data/input node type
function isDataNode(nodeType: string): boolean {
    return nodeType in DATA_NODE_TYPES;
}

// Simple debouncer factory
function createDebounce<T extends unknown[]>(
    callback: (...args: T) => void,
    delay: number,
) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: T) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            callback(...args);
            timeoutId = null;
        }, delay);
    };
}

// Persist React Flow nodes to localStorage with debouncing
const debouncedSaveNodes = createDebounce((nodes: Node[]) => {
    localStorage.setItem("nodes", JSON.stringify(nodes));
}, 500);

// Persist edges similarly
const debouncedSaveEdges = createDebounce((edges: Edge[]) => {
    localStorage.setItem("edges", JSON.stringify(edges));
}, 500);

// Persist workflow meta (title, ids, notes)
const debouncedSaveWorkflowMeta = createDebounce(
    (meta: { id: number | null; name: string; description: string }) => {
        localStorage.setItem("workflowMeta", JSON.stringify(meta));
    },
    500,
);

export interface PossibleNode {
    type: string;
    data?: Record<string, unknown>;
}

export interface FlowState {
    currFlow: { nodes: Node[]; edges: Edge[] };
    nodes: Node[];
    edges: Edge[];
    workflowName: string;
    workflowId: number | null;
    workflowDescription: string;

    selectedNodes: Node[];
    comboMode: boolean;
    comboSelectedIds: Set<string>;

    // Combo / selection helpers
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
    onSelectionChange: OnSelectionChangeFunc;
    onNodesChange: OnNodesChange<Node>;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    expands: (nodeId: string | null, possibleNodes: PossibleNode[]) => string[];
    compose: (newNode: { type: string; data: unknown }) => string;
    updates: (nodeId: string, data: Record<string, unknown>) => void;
    addNode: (
        node: PossibleNode,
        position?: { x: number; y: number },
    ) => string;
    removeNode: (nodeId: string) => void;
    // Node-created listeners
    nodeCreatedCallbacks: Set<(nodeIds: string[]) => void>;
    onNodeCreated: (callback: (nodeIds: string[]) => void) => () => void;
}

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export const useFlow = create<FlowState>((set, get) => ({
    currFlow: { nodes: [], edges: [] },
    nodes: initialNodes,
    edges: initialEdges,
    workflowName: "",
    workflowId: null,
    workflowDescription: "",
    // Multi-select compose mode tracking
    comboMode: false,
    comboSelectedIds: new Set<string>(),

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
    onSelectionChange: ({ nodes }) => {
        set({
            selectedNodes: nodes,
        });
    },
    onNodesChange: (changes) => {
        const nodes = applyNodeChanges(changes, get().nodes);
        let edges = get().edges;
        const removedIds: string[] = [];
        for (const c of changes) {
            if (c.type === "remove") {
                removedIds.push(c.id);
            }
        }
        if (removedIds.length > 0) {
            const idSet = new Set(removedIds);
            edges = edges.filter(
                (e) => !idSet.has(e.source) && !idSet.has(e.target),
            );
        }
        set({
            nodes,
            edges,
        });
        debouncedSaveNodes(nodes);
        debouncedSaveEdges(edges);
    },
    onEdgesChange: (changes) => {
        const edges = applyEdgeChanges(changes, get().edges);
        set({
            edges: edges,
        });
        debouncedSaveEdges(edges);
    },
    onConnect: (connection) => {
        const edges = addEdge(
            { ...connection, type: "custom-edge" },
            get().edges,
        );
        set({
            edges: edges,
        });
        debouncedSaveEdges(edges);
    },
    setNodes: (nodes) => {
        const migrated = migrateWorkflowNodes(nodes);
        set({ nodes: migrated });
        debouncedSaveNodes(migrated);
    },
    setEdges: (edges) => {
        set({ edges });
        debouncedSaveEdges(edges);
    },
    updates: (nodeId: string, data: Record<string, unknown>) => {
        const newNodes = get().nodes.map((node) => {
            if (node.id === nodeId) {
                return {
                    ...node,
                    data,
                };
            }
            return node;
        });
        set({
            nodes: newNodes,
        });
        debouncedSaveNodes(newNodes);
    },
    addNode: (node: PossibleNode, position?: { x: number; y: number }) => {
        const { nodes } = get();

        let defaultX = 100;
        let defaultY = 100;

        if (position) {
            defaultX = position.x;
            defaultY = position.y;
        } else if (nodes.length > 0) {
            // Spawn to the far right when the canvas already has nodes
            const rightmostNode = nodes.reduce((rightmost, current) => {
                const currentRight =
                    current.position.x + (current.measured?.width ?? 150);
                const rightmostRight =
                    rightmost.position.x + (rightmost.measured?.width ?? 150);
                return currentRight > rightmostRight ? current : rightmost;
            });

            defaultX =
                rightmostNode.position.x +
                (rightmostNode.measured?.width ?? 150) +
                200;
            defaultY = rightmostNode.position.y;
        }

        const nodeId = v4();
        const newNode = {
            id: nodeId,
            type: node.type,
            position: {
                x: defaultX,
                y: defaultY,
            },
            origin: [0.5, 0.5] as [number, number],
            data: node?.data ?? {},
        };
        const newNodes = nodes.concat(newNode);
        set({ nodes: newNodes });
        debouncedSaveNodes(newNodes);
        // Notify canvas listeners that a node was inserted
        get().nodeCreatedCallbacks.forEach((cb) => cb([nodeId]));
        return nodeId;
    },
    removeNode: (nodeId: string) => {
        const { nodes, edges } = get();
        const newNodes = nodes.filter((node) => node.id !== nodeId);
        const newEdges = edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId,
        );
        set({
            nodes: newNodes,
            edges: newEdges,
        });
        localStorage.setItem("nodes", JSON.stringify(newNodes));
        localStorage.setItem("edges", JSON.stringify(newEdges));
    },

    expands: (nodeId, possibleNodes): string[] => {
        const { nodes } = get();
        let { edges } = get();
        const currNode = nodes.find((node) => node.id === nodeId);
        if (!currNode) {
            return [];
        }

        // Track whether upstream node emits persistent artifacts
        const sourceIsDataNode = isDataNode(currNode.type ?? "");

        // Locate existing downstream nodes via outgoing edges
        const existingChildEdges = edges.filter(
            (edge) => edge.source === currNode.id,
        );
        const existingChildNodes = existingChildEdges
            .map((edge) => nodes.find((n) => n.id === edge.target))
            .filter(Boolean) as Node[];

        // Map downstream nodes by Flow type so we can reuse slots
        // Processing nodes shouldn't spawn duplicate sibling data sinks
        const existingChildByType = new Map<string, Node>();
        if (!sourceIsDataNode) {
            for (const child of existingChildNodes) {
                if (child.type) {
                    existingChildByType.set(child.type, child);
                }
            }
        }

        const { measured, position } = currNode;
        const ids: string[] = [];
        const newNodes: Node[] = [];
        const newlyCreatedIds: string[] = [];
        let updatedNodes = [...nodes];

        // Only materialize missing downstream types
        const nodesToCreate = possibleNodes.filter(
            ({ type }) => !existingChildByType.has(type),
        );

        const X_OFFSET = 250; // Horizontal gap from parent
        const Y_SPACING = 150; // Vertical spacing between spawned nodes

        // Child center.x = parent's right edge + offset (origin at [0.5, 0.5])
        const newX = position.x + (measured?.width ?? 150) / 2 + X_OFFSET;

        // Vertically distribute new nodes around the parent's center.y
        const centerY = position.y;
        const startY = centerY - (Y_SPACING * (nodesToCreate.length - 1)) / 2;

        let newNodeIndex = 0;
        for (const { type, data = {} } of possibleNodes) {
            const existingChild = existingChildByType.get(type);

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
                const newNodeId = v4();
                ids.push(newNodeId);
                newlyCreatedIds.push(newNodeId);
                const edgeId = v4();

                newNodes.push({
                    id: newNodeId,
                    type: type,
                    position: {
                        x: newX,
                        y: startY + Y_SPACING * newNodeIndex,
                    },
                    origin: [0.5, 0.5],
                    data,
                });

                edges = addEdge(
                    {
                        id: edgeId,
                        source: `${currNode.id}`,
                        target: newNodeId,
                        type: "custom-edge",
                    },
                    edges,
                );

                newNodeIndex++;
            }
        }

        const allNodes = migrateWorkflowNodes(updatedNodes.concat(newNodes));
        set({
            nodes: allNodes,
            edges: [...edges],
        });
        debouncedSaveNodes(allNodes);
        debouncedSaveEdges(edges);
        // Announce only the brand-new node ids
        if (newlyCreatedIds.length > 0) {
            get().nodeCreatedCallbacks.forEach((cb) => cb(newlyCreatedIds));
        }
        return ids;
    },
    compose: ({ type, data }: { type: string; data: unknown }) => {
        const { comboSelectedIds, nodes, edges } = get();
        const nodeId = v4();

        // Bounding volume of the multi-select set
        const positions = Array.from(comboSelectedIds)
            .map((id) => {
                const node = nodes.find((n) => n.id === id);
                if (!node) return null;
                return {
                    x: node.position.x,
                    y: node.position.y,
                    width: node.measured?.width ?? 150,
                    height: node.measured?.height ?? 100,
                };
            })
            .filter(Boolean) as unknown as Array<{
            x: number;
            y: number;
            width: number;
            height: number;
        }>;

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

        // Place composed node to the right, vertically centered on selection
        const X_OFFSET = 250;
        const newNode: Node = {
            id: nodeId,
            type: type,
            position: {
                x: rightmostX + X_OFFSET,
                y: centerY, // Already node-center coordinates
            },
            origin: [0.5, 0.5],
            data: (data ?? {}) as Record<string, unknown>,
        };

        const newEdges: Edge[] = Array.from(comboSelectedIds)
            .map((id) => {
                const node = nodes.find((n) => n.id === id);
                if (!node) return null;
                return {
                    id: v4(),
                    source: `${node.id}`,
                    target: nodeId,
                    type: "custom-edge",
                };
            })
            .filter(Boolean) as Edge[];

        const allEdges = edges.concat(newEdges);
        const allNodes = migrateWorkflowNodes(nodes.concat([newNode]));

        set({
            nodes: allNodes,
            edges: allEdges,
        });
        debouncedSaveNodes(allNodes);
        debouncedSaveEdges(allEdges);
        get().clearCombo();
        // Same notification path as addNode
        get().nodeCreatedCallbacks.forEach((cb) => cb([nodeId]));
        return nodeId;
    },

    setComboMode: (enabled) => {
        if (!enabled) {
            set({ comboMode: false, comboSelectedIds: new Set() }); // Fresh Set bumps referential equality
        } else {
            set({ comboMode: true }); // Preserve combo selection refs
        }
    },

    isInCombo: (id) => get().comboSelectedIds.has(id),

    toggleCombo: (id) => {
        const { comboSelectedIds } = get();
        const next = new Set(comboSelectedIds);
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

    clearCombo: () => set({ comboMode: false, comboSelectedIds: new Set() }),

    setWorkflowName: (name) => {
        set({ workflowName: name });
        const state = get();
        // Unsaved canvases omit cached titles so localized defaults survive language toggles
        debouncedSaveWorkflowMeta({
            id: state.workflowId,
            name: state.workflowId ? name : "",
            description: state.workflowDescription,
        });
    },

    setWorkflowId: (id) => {
        set({ workflowId: id });
        const state = get();
        debouncedSaveWorkflowMeta({
            id: id,
            name: state.workflowName,
            description: state.workflowDescription,
        });
    },

    setWorkflowDescription: (description) => {
        set({ workflowDescription: description });
        const state = get();
        debouncedSaveWorkflowMeta({
            id: state.workflowId,
            name: state.workflowName,
            description: description,
        });
    },
}));

export default useFlow;
