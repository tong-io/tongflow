/**
 * ReactFlow 状态管理 Hook
 * 基于 Zustand，管理节点和边的状态
 */

import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Edge,
    type Node,
    type OnSelectionChangeFunc,
    type OnNodesChange,
    type OnEdgesChange,
    type OnConnect,
} from "@xyflow/react";
import { create } from "zustand";
import { v4 } from "uuid";
import { DATA_NODE_TYPES } from "@/utils/executable-workflow";

// 判断节点是否为数据节点
function isDataNode(nodeType: string): boolean {
    return nodeType in DATA_NODE_TYPES;
}

// 防抖工具函数
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

// 保存节点数据到 localStorage（带防抖）
const debouncedSaveNodes = createDebounce((nodes: Node[]) => {
    localStorage.setItem("nodes", JSON.stringify(nodes));
}, 500);

// 保存边数据到 localStorage（带防抖）
const debouncedSaveEdges = createDebounce((edges: Edge[]) => {
    localStorage.setItem("edges", JSON.stringify(edges));
}, 500);

// 保存工作流元信息到 localStorage（带防抖）
const debouncedSaveWorkflowMeta = createDebounce(
    (meta: {
        id: number | null;
        name: string;
        description: string;
        currentShareId: number | null;
    }) => {
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
    currentShareId: number | null;

    selectedNodes: Node[];
    comboMode: boolean;
    comboSelectedIds: Set<string>;

    // 放置模式状态
    placingNodeId: string | null;
    isPlacingMode: boolean;

    // 原子接口
    setComboMode: (enabled: boolean) => void;
    isInCombo: (id: string) => boolean;
    toggleCombo: (id: string) => void;
    clearCombo: () => void;
    setWorkflowName: (name: string) => void;
    setWorkflowId: (id: number | null) => void;
    setWorkflowDescription: (description: string) => void;
    setCurrentShareId: (id: number | null) => void;

    // 放置模式接口
    startPlacing: (node: PossibleNode) => string;
    updatePlacingPosition: (position: { x: number; y: number }) => void;
    confirmPlacing: () => void;
    cancelPlacing: () => void;

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
    addNode: (node: PossibleNode) => string;
    removeNode: (nodeId: string) => void;
    // 节点创建回调
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
    currentShareId: null,

    // 组合模式相关状态
    comboMode: false,
    comboSelectedIds: new Set<string>(),

    // 放置模式相关状态
    placingNodeId: null,
    isPlacingMode: false,

    // 节点创建回调
    nodeCreatedCallbacks: new Set(),
    onNodeCreated: (callback) => {
        const callbacks = get().nodeCreatedCallbacks;
        callbacks.add(callback);
        // 返回取消订阅函数
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
        set({ nodes });
        debouncedSaveNodes(nodes);
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
    addNode: (node: PossibleNode) => {
        const { nodes } = get();

        // 计算一个更智能的默认位置
        let defaultX = 100;
        let defaultY = 100;

        if (nodes.length > 0) {
            // 如果已有节点，在最右侧添加新节点
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
        // 触发节点创建回调
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

    // 放置模式方法
    startPlacing: (node: PossibleNode) => {
        const { nodes } = get();
        const nodeId = v4();
        const newNode = {
            id: nodeId,
            type: node.type,
            position: { x: 0, y: 0 }, // 初始位置，将由鼠标位置更新
            origin: [0.5, 0.5] as [number, number],
            data: node?.data ?? {},
        };
        const newNodes = nodes.concat(newNode);
        set({
            nodes: newNodes,
            placingNodeId: nodeId,
            isPlacingMode: true,
        });
        // 不触发 nodeCreatedCallbacks，等确认放置后再触发
        return nodeId;
    },

    updatePlacingPosition: (position: { x: number; y: number }) => {
        const { placingNodeId, nodes } = get();
        if (!placingNodeId) return;

        const newNodes = nodes.map((node) => {
            if (node.id === placingNodeId) {
                return { ...node, position };
            }
            return node;
        });
        set({ nodes: newNodes });
        // 不保存到 localStorage，等确认放置后再保存
    },

    confirmPlacing: () => {
        const { placingNodeId, nodes } = get();
        if (!placingNodeId) return;

        set({
            placingNodeId: null,
            isPlacingMode: false,
        });
        debouncedSaveNodes(nodes);
        // 确认放置后触发节点创建回调（用于 fitView 等）
        get().nodeCreatedCallbacks.forEach((cb) => cb([placingNodeId]));
    },

    cancelPlacing: () => {
        const { placingNodeId, nodes, edges } = get();
        if (!placingNodeId) return;

        const newNodes = nodes.filter((node) => node.id !== placingNodeId);
        const newEdges = edges.filter(
            (edge) =>
                edge.source !== placingNodeId && edge.target !== placingNodeId,
        );
        set({
            nodes: newNodes,
            edges: newEdges,
            placingNodeId: null,
            isPlacingMode: false,
        });
        // 不需要保存，因为节点从未被持久化
    },
    expands: (nodeId, possibleNodes): string[] => {
        const { nodes } = get();
        let { edges } = get();
        const currNode = nodes.find((node) => node.id === nodeId);
        if (!currNode) {
            return [];
        }

        // 判断源节点是否为数据节点
        const sourceIsDataNode = isDataNode(currNode.type ?? "");

        // 找到当前节点已连接的下游节点（source 为当前节点的边）
        const existingChildEdges = edges.filter(
            (edge) => edge.source === currNode.id,
        );
        const existingChildNodes = existingChildEdges
            .map((edge) => nodes.find((n) => n.id === edge.target))
            .filter(Boolean) as Node[];

        // 按类型建立已有子节点的映射
        // 只有当源节点是处理节点时，才需要防止创建重复的数据节点
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

        // 筛选出需要新建的节点（没有同类型已存在的）
        const nodesToCreate = possibleNodes.filter(
            ({ type }) => !existingChildByType.has(type),
        );

        // 计算x方向的固定距离
        const X_OFFSET = 250;
        // 计算y方向的间距
        const Y_SPACING = 150;

        // 新节点的x位置：原节点右边缘 + 固定距离
        // 由于 origin: [0.5, 0.5]，position.x 是节点中心的 x 坐标
        const newX = position.x + (measured?.width ?? 150) / 2 + X_OFFSET;

        // 计算起始y位置，使多个新节点在原节点周围垂直居中分布
        // 由于 origin: [0.5, 0.5]，position.y 已是节点中心的 y 坐标
        const centerY = position.y;
        const startY = centerY - (Y_SPACING * (nodesToCreate.length - 1)) / 2;

        let newNodeIndex = 0;
        for (const { type, data = {} } of possibleNodes) {
            const existingChild = existingChildByType.get(type);

            if (existingChild) {
                // 已存在同类型节点，更新其 data
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
                // 不存在同类型节点，创建新节点
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

        const allNodes = updatedNodes.concat(newNodes);
        set({
            nodes: allNodes,
            edges: [...edges],
        });
        debouncedSaveNodes(allNodes);
        debouncedSaveEdges(edges);
        // 触发节点创建回调（只对新创建的节点）
        if (newlyCreatedIds.length > 0) {
            get().nodeCreatedCallbacks.forEach((cb) => cb(newlyCreatedIds));
        }
        return ids;
    },
    compose: ({ type, data }: { type: string; data: unknown }) => {
        const { comboSelectedIds, nodes, edges } = get();
        const nodeId = v4();

        // 计算所有选中节点的边界
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

        // 找到最右边的节点位置
        // 由于 origin: [0.5, 0.5]，pos.x 是节点中心，需要加上宽度的一半
        const rightmostX = Math.max(
            ...positions.map((pos) => pos.x + pos.width / 2),
        );

        // 计算所有节点的垂直中心
        // 由于 origin: [0.5, 0.5]，pos.y 已是节点中心
        const minY = Math.min(
            ...positions.map((pos) => pos.y - pos.height / 2),
        );
        const maxY = Math.max(
            ...positions.map((pos) => pos.y + pos.height / 2),
        );
        const centerY = (minY + maxY) / 2;

        // 新节点位置：最右侧 + 固定距离，垂直居中
        const X_OFFSET = 250;
        const newNode: Node = {
            id: nodeId,
            type: type,
            position: {
                x: rightmostX + X_OFFSET,
                y: centerY, // 已正确计算为中心点
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
        const allNodes = nodes.concat([newNode]);

        set({
            nodes: allNodes,
            edges: allEdges,
        });
        debouncedSaveNodes(allNodes);
        debouncedSaveEdges(allEdges);
        get().clearCombo();
        // 触发节点创建回调
        get().nodeCreatedCallbacks.forEach((cb) => cb([nodeId]));
        return nodeId;
    },

    setComboMode: (enabled) => {
        if (!enabled) {
            set({ comboMode: false, comboSelectedIds: new Set() }); // 新 Set，保持引用变化
        } else {
            set({ comboMode: true }); // 不动选集合
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
            comboMode: next.size > 0, // 自动开/关组合模式
        });
    },

    clearCombo: () => set({ comboMode: false, comboSelectedIds: new Set() }),

    setWorkflowName: (name) => {
        set({ workflowName: name });
        const state = get();
        // 如果 workflowId 为 null（未保存的工作流），不缓存 name，以便切换语言时使用正确的默认名称
        debouncedSaveWorkflowMeta({
            id: state.workflowId,
            name: state.workflowId ? name : "",
            description: state.workflowDescription,
            currentShareId: state.currentShareId,
        });
    },

    setWorkflowId: (id) => {
        set({ workflowId: id });
        const state = get();
        debouncedSaveWorkflowMeta({
            id: id,
            name: state.workflowName,
            description: state.workflowDescription,
            currentShareId: state.currentShareId,
        });
    },

    setWorkflowDescription: (description) => {
        set({ workflowDescription: description });
        const state = get();
        debouncedSaveWorkflowMeta({
            id: state.workflowId,
            name: state.workflowName,
            description: description,
            currentShareId: state.currentShareId,
        });
    },

    setCurrentShareId: (id) => {
        set({ currentShareId: id });
        const state = get();
        debouncedSaveWorkflowMeta({
            id: state.workflowId,
            name: state.workflowName,
            description: state.workflowDescription,
            currentShareId: id,
        });
    },
}));

export default useFlow;
