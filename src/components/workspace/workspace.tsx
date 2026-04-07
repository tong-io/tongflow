"use client";

/**
 * Workspace 主组件
 * ReactFlow 画布，管理节点和边
 */

import type { Connection, Edge, Node, IsValidConnection } from "@xyflow/react";
import {
    ReactFlow,
    Controls,
    Background,
    useReactFlow,
    ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useShallow } from "zustand/react/shallow";
import type { FlowState } from "@/hooks/use-flow";
import { useFlow } from "@/hooks/use-flow";
import { EDGE_TYPES, NODE_TYPES } from "./types";
import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { RegionProvider } from "@/contexts/region-context";
import type { RegionType } from "@/lib/region-utils";
import { isValidFlowConnection } from "@/utils/connection-rules";
import { usePreloadFeatures } from "@/hooks/use-features";
import { useWorkflowRecovery } from "@/hooks/use-workflow-recovery";
import SmartIsland from "./smart-island";
import { ModeSwitch } from "./mode-switch";
import { WorkflowTitleMenu } from "./workflow-title-menu";
import { TaskProgressToast } from "./task-progress-toast";
import { WorkspaceNav } from "./workspace-nav";
import { WorkspaceLeftNav } from "./workspace-left-nav";

// Selector for performance optimization - 只选择数据，不选择函数
const selector = (state: FlowState) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflowName: state.workflowName,
    isPlacingMode: state.isPlacingMode,
});

/**
 * Workspace 内部组件
 * 必须在 ReactFlowProvider 内部使用
 */
function WorkspaceInner({ user }: { user?: { id: string; email: string } }) {
    const tIndex = useTranslations("Index");
    const locale = useLocale();
    const [colorMode, setColorMode] = useState<"light" | "dark">("light");

    // 分开获取数据和函数，避免函数引用变化导致重新渲染
    const { nodes, edges, workflowName, isPlacingMode } = useFlow(
        useShallow(selector),
    );

    // 直接从 store 获取函数（函数引用永不变化）
    const onNodesChange = useFlow.getState().onNodesChange;
    const onEdgesChange = useFlow.getState().onEdgesChange;
    const onSelectionChange = useFlow.getState().onSelectionChange;
    const onConnect = useFlow.getState().onConnect;
    const reactFlowInstance = useReactFlow();

    const isValidConnection = useCallback<IsValidConnection<Edge>>(
        (connection) => {
            const { nodes, edges } = useFlow.getState();
            return isValidFlowConnection(
                connection as Connection,
                nodes,
                edges,
            );
        },
        [],
    );

    // 监听主题变化
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class") {
                    setColorMode(
                        document.documentElement.classList.contains("dark")
                            ? "dark"
                            : "light",
                    );
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        // 初始化主题
        setColorMode(
            document.documentElement.classList.contains("dark")
                ? "dark"
                : "light",
        );

        return () => observer.disconnect();
    }, []);

    // 预加载功能数据
    usePreloadFeatures();

    // 节点数据更新回调（不依赖 nodes，直接从 store 获取最新状态）
    const handleNodeDataUpdate = useCallback(
        (nodeId: string, data: { fileKeys?: string[]; texts?: string[] }) => {
            const currentNodes = useFlow.getState().nodes;
            const node = currentNodes.find((n) => n.id === nodeId);
            if (node) {
                const currentData =
                    (node.data as Record<string, unknown>) || {};
                const newData: Record<string, unknown> = { ...currentData };
                if (data.fileKeys && data.fileKeys.length > 0) {
                    newData.fileKeys = data.fileKeys;
                }
                if (data.texts && data.texts.length > 0) {
                    newData.texts = data.texts;
                }
                useFlow.getState().updates(nodeId, newData);
            }
        },
        [],
    );

    // 工作流任务恢复 Hook
    useWorkflowRecovery({
        onNodeDataUpdate: handleNodeDataUpdate,
    });

    // 订阅节点创建事件，平滑缩放到新节点
    useEffect(() => {
        const unsubscribe = useFlow.getState().onNodeCreated((nodeIds) => {
            if (nodeIds.length === 0) return;
            // 延迟执行 fitView，等待节点渲染完成
            setTimeout(() => {
                void reactFlowInstance.fitView({
                    nodes: nodeIds.map((id) => ({ id })),
                    duration: 800,
                    padding: 0.3,
                    maxZoom: 1.2,
                    minZoom: 0.1,
                });
            }, 50);
        });
        return unsubscribe;
    }, [reactFlowInstance]);

    // 处理节点双击，平滑缩放视图
    const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
        if (!node?.position) return;

        // 使用 ReactFlow 的内置方法来精确居中节点
        void reactFlowInstance.fitView({
            nodes: [{ id: node.id }],
            duration: 800,
            padding: 0.3, // 在节点周围留出 30% 的空间
            maxZoom: 1.2,
            minZoom: 0.1,
        });
    };

    // 点击画布空白处退出 Combo Mode 或确认放置
    const handlePaneClick = useCallback(() => {
        const store = useFlow.getState();
        // 放置模式由 handleClick 处理，这里不需要处理
        if (store.isPlacingMode) {
            return;
        }
        if (store.comboMode) {
            store.setComboMode(false);
        }
    }, []);

    // 容器级别的点击处理（确保放置模式下点击任何地方都能确认）
    const handleClick = useCallback((event: React.MouseEvent) => {
        const store = useFlow.getState();
        if (store.isPlacingMode) {
            // 阻止事件传播到 ReactFlow，避免触发其他点击逻辑
            event.stopPropagation();
            store.confirmPlacing();
        }
    }, []);

    // 右键点击取消放置
    const handleContextMenu = useCallback((event: React.MouseEvent) => {
        const store = useFlow.getState();
        if (store.isPlacingMode) {
            event.preventDefault();
            store.cancelPlacing();
        }
    }, []);

    // 鼠标移动时更新放置中节点的位置
    const handleMouseMove = useCallback(
        (event: React.MouseEvent) => {
            const store = useFlow.getState();
            if (!store.isPlacingMode) return;

            // 将屏幕坐标转换为画布坐标
            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            store.updatePlacingPosition(position);
        },
        [reactFlowInstance],
    );

    // 监听 Escape 键退出 Combo Mode 或取消放置
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                const store = useFlow.getState();
                // 优先取消放置模式
                if (store.isPlacingMode) {
                    store.cancelPlacing();
                    return;
                }
                if (store.comboMode) {
                    store.setComboMode(false);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // 从 localStorage 恢复节点、边和工作流元信息
    useEffect(() => {
        const savedNodes = localStorage.getItem("nodes");
        const savedEdges = localStorage.getItem("edges");
        const savedMeta = localStorage.getItem("workflowMeta");

        if (savedNodes) {
            try {
                const nodes = JSON.parse(savedNodes) as Node[];
                if (nodes.length > 0) {
                    useFlow.getState().setNodes(nodes);
                }
            } catch (e) {
                console.error("Failed to parse nodes:", e);
            }
        }

        if (savedEdges) {
            try {
                const edges = JSON.parse(savedEdges) as Edge[];
                if (edges.length > 0) {
                    useFlow.getState().setEdges(edges);
                }
            } catch (e) {
                console.error("Failed to parse edges:", e);
            }
        }

        if (savedMeta) {
            try {
                const meta = JSON.parse(savedMeta) as {
                    id: number | null;
                    name: string;
                    description: string;
                    currentShareId?: number | null;
                };
                // 如果有 workflowId 且有 name，使用缓存的 name；否则使用当前语言的默认名称
                const effectiveName =
                    meta.id && meta.name ? meta.name : tIndex("title");
                useFlow.setState({
                    workflowId: meta.id,
                    workflowName: effectiveName,
                    workflowDescription: meta.description || "",
                    currentShareId: meta.currentShareId ?? null,
                });
            } catch (e) {
                console.error("Failed to parse workflowMeta:", e);
            }
        } else {
            // 没有缓存的 meta，设置默认名称
            useFlow.setState({
                workflowName: tIndex("title"),
            });
        }
    }, []);

    // 监听语言切换：如果是未保存的工作流，更新为当前语言的默认名称
    useEffect(() => {
        const workflowId = useFlow.getState().workflowId;
        if (!workflowId) {
            // 未保存的工作流，更新名称为当前语言的默认名称
            useFlow.setState({
                workflowName: tIndex("title"),
            });
        }
    }, [locale, tIndex]);

    return (
        <div
            className="relative w-full h-full overflow-hidden [&_.react-flow]:!bg-[#f6f7f9] dark:[&_.react-flow]:!bg-background"
            onMouseMove={handleMouseMove}
            onClick={handleClick}
        >
            <ReactFlow
                nodes={nodes}
                onNodesChange={onNodesChange}
                edges={edges}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                defaultEdgeOptions={{
                    type: "custom-edge",
                    selectable: false,
                    focusable: false,
                }}
                onSelectionChange={onSelectionChange}
                onNodeDoubleClick={handleNodeDoubleClick}
                onPaneClick={handlePaneClick}
                onContextMenu={handleContextMenu}
                nodesDraggable={!isPlacingMode}
                nodeOrigin={[0.5, 0.5]}
                selectNodesOnDrag={false}
                fitView
                minZoom={0.001} // 极限缩小
                maxZoom={1000} // 极限放大
                proOptions={{ hideAttribution: true }}
                colorMode={colorMode}
            >
                <Background />
                <Controls />
            </ReactFlow>

            <div className="absolute left-1/2 bottom-5 transform -translate-x-1/2 z-10">
                <SmartIsland />
            </div>

            <div className="absolute left-5 top-5 z-10 flex items-center gap-3">
                <WorkflowTitleMenu />
                <WorkspaceLeftNav />
            </div>

            <div className="absolute right-5 top-5 z-10">
                <WorkspaceNav />
            </div>

            <div className="absolute right-4 bottom-5 z-10">
                <ModeSwitch />
            </div>

            {/* SSE 任务进度浮动提示 */}
            <TaskProgressToast />
        </div>
    );
}

/**
 * Workspace 主组件（带 Provider）
 */
export default function Workspace({
    user,
    region = "intl",
}: {
    user?: { id: string; email: string };
    region?: RegionType;
}) {
    return (
        <RegionProvider region={region}>
            <ReactFlowProvider>
                <WorkspaceInner user={user} />
            </ReactFlowProvider>
        </RegionProvider>
    );
}
