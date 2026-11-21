"use client";

/**
 * FlowCanvas — the React Flow canvas and nothing else.
 *
 * Renders the node/edge components over the flow store, enforces the ABI
 * connection contract while the user drags, handles reconnect / drop-to-
 * delete, follows newly created nodes with the camera and exposes an
 * imperative handle (`fitView` / `focusNode` / `tidyLayout`). When the host
 * configured a `workflowRunner`, a "Run workflow" action sits top-right.
 * Everything else that is application shell — navigation, dialogs,
 * persistence, execution plumbing, onboarding — lives in the host
 * (`workspace.tsx`), which passes overlays in as `children` (rendered inside
 * a React Flow `Panel`).
 */

import type {
    Connection,
    Edge,
    FinalConnectionState,
    IsValidConnection,
    Node,
    OnReconnect,
    PanelPosition,
} from "@xyflow/react";
import {
    Background,
    Controls,
    Panel,
    ReactFlow,
    reconnectEdge,
    useReactFlow,
} from "@xyflow/react";
import {
    forwardRef,
    type ReactNode,
    useCallback,
    useEffect,
    useImperativeHandle,
    useState,
} from "react";
import { useTranslations } from "use-intl";
import { useShallow } from "zustand/react/shallow";
import { isValidFlowConnection } from "../core";
import { RunWorkflowAction } from "./components/run-workflow-action";
import type { FlowState } from "./hooks/use-flow";
import { useFlow } from "./hooks/use-flow";
import { cn } from "./lib/utils";
import { EDGE_TYPES, NODE_TYPES } from "./node-types";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./ui/alert-dialog";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface FlowCanvasHandle {
    /** Fit the viewport to the whole graph, or to `nodeIds` when given. */
    fitView: (nodeIds?: string[]) => void;
    /** Smoothly center one node. */
    focusNode: (nodeId: string) => void;
    /** Tidy the whole canvas (or the components containing `seedIds`). */
    tidyLayout: (seedIds?: string[]) => boolean;
}

export interface FlowCanvasProps {
    /** Overlay rendered inside a React Flow `Panel` (e.g. an action island). */
    children?: ReactNode;
    /** Where the `children` panel is anchored (default bottom-center). */
    panelPosition?: PanelPosition;
    panelClassName?: string;
    /**
     * Keep the canvas mounted but hidden and inert (the host is showing an
     * alternative view over it).
     */
    hidden?: boolean;
    /** Show React Flow's zoom controls (default true). */
    showControls?: boolean;
    className?: string;
    /** Follow newly created nodes with the camera (default true). */
    followNewNodes?: boolean;
}

const FIT_VIEW_OPTS = {
    duration: 800,
    padding: 0.3,
    maxZoom: 1.2,
    minZoom: 0.1,
} as const;

// Data-only selector so function-reference churn never re-renders the canvas.
const selector = (state: FlowState) => ({
    nodes: state.nodes,
    edges: state.edges,
});

/** Tracks the `dark` class on <html> to drive React Flow's colorMode. */
function useDocumentColorMode(): "light" | "dark" {
    const [colorMode, setColorMode] = useState<"light" | "dark">("light");
    useEffect(() => {
        const read = () =>
            setColorMode(
                document.documentElement.classList.contains("dark")
                    ? "dark"
                    : "light",
            );
        const observer = new MutationObserver((mutations) => {
            if (mutations.some((m) => m.attributeName === "class")) read();
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        read();
        return () => observer.disconnect();
    }, []);
    return colorMode;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(
    function FlowCanvas(
        {
            children,
            panelPosition = "bottom-center",
            panelClassName = "!mb-5 z-10",
            hidden = false,
            showControls = true,
            className,
            followNewNodes = true,
        },
        ref,
    ) {
        const tEdges = useTranslations("Workspace.edges");
        const colorMode = useDocumentColorMode();
        const reactFlowInstance = useReactFlow();

        // Separate data and functions to avoid re-renders caused by function
        // reference changes.
        const { nodes, edges } = useFlow(useShallow(selector));

        // Function references on the store never change.
        const onNodesChange = useFlow.getState().onNodesChange;
        const onEdgesChange = useFlow.getState().onEdgesChange;
        const onSelectionChange = useFlow.getState().onSelectionChange;
        const onConnect = useFlow.getState().onConnect;

        /* ---- imperative handle ------------------------------------ */

        useImperativeHandle(
            ref,
            () => ({
                fitView: (nodeIds) => {
                    void reactFlowInstance.fitView({
                        ...FIT_VIEW_OPTS,
                        ...(nodeIds
                            ? { nodes: nodeIds.map((id) => ({ id })) }
                            : {}),
                    });
                },
                focusNode: (nodeId) => {
                    void reactFlowInstance.fitView({
                        ...FIT_VIEW_OPTS,
                        nodes: [{ id: nodeId }],
                    });
                },
                tidyLayout: (seedIds) => useFlow.getState().autoLayout(seedIds),
            }),
            [reactFlowInstance],
        );

        /* ---- connection contract ---------------------------------- */

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

        // Edge whose endpoint was dropped on empty canvas → confirm deletion.
        const [pendingDeleteEdgeId, setPendingDeleteEdgeId] = useState<
            string | null
        >(null);

        // Users may drag new connections between handles or reconnect an
        // existing edge's endpoint; isValidConnection enforces the contract.
        const onReconnectStart = useCallback((_event: unknown, edge: Edge) => {
            useFlow.getState().setReconnectingEdgeId(edge.id);
        }, []);

        const onReconnect = useCallback<OnReconnect<Edge>>(
            (oldEdge, newConnection) => {
                const { edges, setEdges, commitHistory } = useFlow.getState();
                commitHistory();
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
            const { edges, setEdges, commitHistory } = useFlow.getState();
            commitHistory();
            setEdges(edges.filter((e) => e.id !== pendingDeleteEdgeId));
            setPendingDeleteEdgeId(null);
        }, [pendingDeleteEdgeId]);

        /* ---- camera / interaction --------------------------------- */

        // Follow node creation: smoothly zoom to the new node(s).
        useEffect(() => {
            if (!followNewNodes) return;
            const unsubscribe = useFlow.getState().onNodeCreated((nodeIds) => {
                if (nodeIds.length === 0) return;
                // Defer fitView until the node has finished rendering
                setTimeout(() => {
                    void reactFlowInstance.fitView({
                        ...FIT_VIEW_OPTS,
                        nodes: nodeIds.map((id) => ({ id })),
                    });
                }, 50);
            });
            return unsubscribe;
        }, [reactFlowInstance, followNewNodes]);

        // Double-click: smoothly zoom the view to the node
        const handleNodeDoubleClick = useCallback(
            (_event: React.MouseEvent, node: Node) => {
                if (!node?.position) return;
                void reactFlowInstance.fitView({
                    ...FIT_VIEW_OPTS,
                    nodes: [{ id: node.id }],
                });
            },
            [reactFlowInstance],
        );

        // Snapshot once at drag start so a whole drag is a single undo entry
        // (position changes then stream through onNodesChange without
        // committing).
        const handleDragStart = useCallback(() => {
            useFlow.getState().commitHistory();
        }, []);

        // Click on empty canvas / Escape exits combo mode.
        const handlePaneClick = useCallback(() => {
            const store = useFlow.getState();
            if (store.comboMode) store.setComboMode(false);
        }, []);
        useEffect(() => {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key !== "Escape") return;
                const store = useFlow.getState();
                if (store.comboMode) store.setComboMode(false);
            };
            window.addEventListener("keydown", handleKeyDown);
            return () => window.removeEventListener("keydown", handleKeyDown);
        }, []);

        return (
            <>
                <div
                    className={cn(
                        "w-full h-full",
                        hidden && "invisible pointer-events-none",
                        className,
                    )}
                    aria-hidden={hidden}
                >
                    <ReactFlow
                        nodes={nodes}
                        onNodesChange={onNodesChange}
                        edges={edges}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        isValidConnection={isValidConnection}
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
                        // While reconnecting, ReactFlow hides the original edge
                        // and shows this connection-line preview following the
                        // cursor. Match the custom-edge style so it stays
                        // visible/cursor-tracked.
                        connectionLineStyle={{
                            strokeWidth: 3,
                            stroke: "#94a3b8",
                            strokeLinecap: "round",
                        }}
                        onSelectionChange={onSelectionChange}
                        onNodeDoubleClick={handleNodeDoubleClick}
                        onPaneClick={handlePaneClick}
                        onNodeDragStart={handleDragStart}
                        onSelectionDragStart={handleDragStart}
                        nodeDragThreshold={1}
                        nodeOrigin={[0.5, 0.5]}
                        selectNodesOnDrag={false}
                        fitView
                        minZoom={0.001}
                        maxZoom={1000}
                        proOptions={{ hideAttribution: true }}
                        colorMode={colorMode}
                    >
                        <Background />
                        {showControls && <Controls />}
                        {/* Renders nothing without a host workflow runner. */}
                        <RunWorkflowAction />
                        {children ? (
                            <Panel
                                position={panelPosition}
                                className={panelClassName}
                            >
                                {children}
                            </Panel>
                        ) : null}
                    </ReactFlow>
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
            </>
        );
    },
);
