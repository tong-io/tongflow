"use client";

/**
 * Workspace main component
 * ReactFlow canvas managing nodes and edges
 */

import type {
    Connection,
    Edge,
    FinalConnectionState,
    IsValidConnection,
    Node,
    OnReconnect,
} from "@xyflow/react";
import {
    Background,
    Controls,
    Panel,
    ReactFlow,
    ReactFlowProvider,
    reconnectEdge,
    useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePreloadFeatures } from "@/hooks/use-features";
import type { FlowState } from "@/hooks/use-flow";
import { useFlow } from "@/hooks/use-flow";
import { useWorkflowRecovery } from "@/hooks/use-workflow-recovery";
import { logger } from "@/lib/logger";
import { isValidFlowConnection } from "@/lib/workflow/connection-rules";
import { parseWorkflowImportJson } from "@/lib/workflow/exporter";
import { ModeSwitch } from "./mode-switch";
import SmartIsland from "./smart-island";
import { EDGE_TYPES, NODE_TYPES } from "./types";
import { WorkflowTitleMenu } from "./workflow-title-menu";
import { WorkspaceLeftNav } from "./workspace-left-nav";
import { WorkspaceNav } from "./workspace-nav";

// Selector for performance optimization - select data only, not functions
const selector = (state: FlowState) => ({
    nodes: state.nodes,
    edges: state.edges,
});

/**
 * Workspace inner component
 * Must be used inside a ReactFlowProvider
 */
function WorkspaceInner({
    user: _user,
}: {
    user?: { id: string; email: string };
}) {
    const tIndex = useTranslations("Index");
    const locale = useLocale();
    const [colorMode, setColorMode] = useState<"light" | "dark">("light");

    // Separate data and functions to avoid re-renders caused by function reference changes
    const { nodes, edges } = useFlow(useShallow(selector));

    // Get functions directly from the store (function references never change)
    const onNodesChange = useFlow.getState().onNodesChange;
    const onEdgesChange = useFlow.getState().onEdgesChange;
    const onSelectionChange = useFlow.getState().onSelectionChange;
    const onConnect = useFlow.getState().onConnect;
    const reactFlowInstance = useReactFlow();

    const isValidConnection = useCallback<IsValidConnection<Edge>>(
        (connection) => {
            const { nodes, edges, reconnectingEdgeId } = useFlow.getState();
            return isValidFlowConnection(
                connection as Connection,
                nodes,
                edges,
                reconnectingEdgeId ?? undefined,
            );
        },
        [],
    );

    const tEdges = useTranslations("Workspace.edges");
    // Edge whose endpoint was dropped on empty canvas → confirm deletion.
    const [pendingDeleteEdgeId, setPendingDeleteEdgeId] = useState<
        string | null
    >(null);

    // Manual edge creation is disabled (handles set isConnectableStart=false).
    // Users may only reconnect an existing edge's endpoint to another handle;
    // isValidConnection above enforces the ABI contract on the new endpoint.
    const onReconnectStart = useCallback((_event: unknown, edge: Edge) => {
        useFlow.getState().setReconnectingEdgeId(edge.id);
    }, []);

    const onReconnect = useCallback<OnReconnect<Edge>>(
        (oldEdge, newConnection) => {
            const { edges, setEdges } = useFlow.getState();
            setEdges(reconnectEdge(oldEdge, newConnection, edges));
        },
        [],
    );

    const onReconnectEnd = useCallback(
        (
            _event: MouseEvent | TouchEvent,
            edge: Edge,
            _handleType: unknown,
            connectionState: FinalConnectionState,
        ) => {
            useFlow.getState().setReconnectingEdgeId(null);
            // Dropped on empty canvas (no target handle) → ask to delete.
            if (!connectionState.toHandle) {
                setPendingDeleteEdgeId(edge.id);
            }
        },
        [],
    );

    const confirmDeleteEdge = useCallback(() => {
        if (!pendingDeleteEdgeId) return;
        const { edges, setEdges } = useFlow.getState();
        setEdges(edges.filter((e) => e.id !== pendingDeleteEdgeId));
        setPendingDeleteEdgeId(null);
    }, [pendingDeleteEdgeId]);

    // Listen for theme changes
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

        // Initialize theme
        setColorMode(
            document.documentElement.classList.contains("dark")
                ? "dark"
                : "light",
        );

        return () => observer.disconnect();
    }, []);

    // Preload feature data
    usePreloadFeatures();

    // Node data update callback (does not depend on nodes; gets the latest state directly from the store)
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

    // Workflow task recovery hook
    useWorkflowRecovery({
        onNodeDataUpdate: handleNodeDataUpdate,
    });

    // Subscribe to node-creation events and smoothly zoom to the new node
    useEffect(() => {
        const unsubscribe = useFlow.getState().onNodeCreated((nodeIds) => {
            if (nodeIds.length === 0) return;
            // Defer fitView until the node has finished rendering
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

    // Handle node double-click: smoothly zoom the view to the node
    const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
        if (!node?.position) return;

        // Use ReactFlow's built-in method to precisely center the node
        void reactFlowInstance.fitView({
            nodes: [{ id: node.id }],
            duration: 800,
            padding: 0.3, // Leave 30% padding around the node
            maxZoom: 1.2,
            minZoom: 0.1,
        });
    };

    // Click on empty canvas to exit Combo Mode
    const handlePaneClick = useCallback(() => {
        const store = useFlow.getState();
        if (store.comboMode) {
            store.setComboMode(false);
        }
    }, []);

    // Listen for the Escape key to exit Combo Mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                const store = useFlow.getState();
                if (store.comboMode) {
                    store.setComboMode(false);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Restore nodes, edges, and workflow metadata from localStorage
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
                logger.error("Failed to parse nodes:", e);
            }
        }

        if (savedEdges) {
            try {
                const edges = JSON.parse(savedEdges) as Edge[];
                if (edges.length > 0) {
                    useFlow.getState().setEdges(edges);
                }
            } catch (e) {
                logger.error("Failed to parse edges:", e);
            }
        }

        if (savedMeta) {
            try {
                const meta = JSON.parse(savedMeta) as {
                    id: number | null;
                    name: string;
                    description: string;
                };
                // If workflowId and name both exist, use the cached name; otherwise use the default name for the current locale
                const effectiveName =
                    meta.id && meta.name ? meta.name : tIndex("title");
                useFlow.setState({
                    workflowId: meta.id,
                    workflowName: effectiveName,
                    workflowDescription: meta.description || "",
                });
            } catch (e) {
                logger.error("Failed to parse workflowMeta:", e);
            }
        } else {
            // No cached metadata — set the default name
            useFlow.setState({
                workflowName: tIndex("title"),
            });
        }
    }, []);

    // First open: preload the bundled example workflow so the canvas isn't
    // empty. Only when nothing has ever been saved locally, and only once.
    useEffect(() => {
        if (localStorage.getItem("nodes") || localStorage.getItem("edges")) {
            return;
        }
        if (localStorage.getItem("exampleLoaded")) return;
        localStorage.setItem("exampleLoaded", "1");

        let cancelled = false;
        fetch("/example.json")
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                const parsed = parseWorkflowImportJson(json);
                useFlow.getState().setNodes(parsed.nodes);
                useFlow.getState().setEdges(parsed.edges);
                if (parsed.name)
                    useFlow.getState().setWorkflowName(parsed.name);
                if (parsed.description) {
                    useFlow
                        .getState()
                        .setWorkflowDescription(parsed.description);
                }
            })
            .catch((e) => {
                logger.error("Failed to load example workflow:", e);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    // Listen for locale changes: if the workflow is unsaved, update the name to the default for the new locale
    useEffect(() => {
        const workflowId = useFlow.getState().workflowId;
        if (!workflowId) {
            // Unsaved workflow — update the name to the default for the current locale
            useFlow.setState({
                workflowName: tIndex("title"),
            });
        }
    }, [locale, tIndex]);

    return (
        <div className="relative w-full h-full overflow-hidden [&_.react-flow]:!bg-[#f6f7f9] dark:[&_.react-flow]:!bg-background">
            <ReactFlow
                nodes={nodes}
                onNodesChange={onNodesChange}
                edges={edges}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                // Manual new connections are disabled at the handle level
                // (isConnectableStart={false}); users may only reconnect an
                // existing edge's endpoint, validated by isValidConnection.
                onReconnect={onReconnect}
                onReconnectStart={onReconnectStart}
                onReconnectEnd={onReconnectEnd}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                defaultEdgeOptions={{
                    type: "custom-edge",
                    selectable: false,
                    focusable: false,
                }}
                // While reconnecting, ReactFlow hides the original edge and
                // shows this connection-line preview following the cursor.
                // Match the custom-edge style so it stays visible/cursor-tracked.
                connectionLineStyle={{
                    strokeWidth: 3,
                    stroke: "#94a3b8",
                    strokeLinecap: "round",
                }}
                onSelectionChange={onSelectionChange}
                onNodeDoubleClick={handleNodeDoubleClick}
                onPaneClick={handlePaneClick}
                nodeOrigin={[0.5, 0.5]}
                selectNodesOnDrag={false}
                fitView
                minZoom={0.001} // Minimum zoom limit
                maxZoom={1000} // Maximum zoom limit
                proOptions={{ hideAttribution: true }}
                colorMode={colorMode}
            >
                <Background />
                <Controls />
                <Panel position="bottom-center" className="!mb-5 z-10">
                    <SmartIsland />
                </Panel>
            </ReactFlow>

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

            <AlertDialog
                open={pendingDeleteEdgeId !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingDeleteEdgeId(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {tEdges("deleteConfirmTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {tEdges("deleteConfirmDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {tEdges("cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteEdge}>
                            {tEdges("delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/**
 * Workspace main component (with Provider)
 */
export default function Workspace({
    user,
}: {
    user?: { id: string; email: string };
}) {
    return (
        <ReactFlowProvider>
            <WorkspaceInner user={user} />
        </ReactFlowProvider>
    );
}
