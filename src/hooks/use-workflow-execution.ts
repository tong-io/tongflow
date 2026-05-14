"use client";

/**
 * Workflow execution hook
 *
 * Encapsulates everything that smart-island previously did inline:
 *  - Calling the backend to create a task
 *  - Streaming progress over SSE and propagating to React Flow state + the progress toast
 *  - Saving the workflow before each execute
 *  - Cancelling a running workflow and the 10-second backend-stall fallback
 *
 * Cancellation timeout is stored in a local `useRef` instead of `window.__cancelTimeoutId`,
 * which was the previous source of global state pollution.
 */

import type { Edge, Node } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
    emitSSEConnected,
    emitSSETaskMessage,
} from "@/components/workspace/task-progress-toast";
import {
    NodeStatus,
    TaskStatus,
    WorkflowStatus,
} from "@/constants/task-status";
import { useTaskStore } from "@/hooks/use-task";
import { saveFromTask } from "@/lib/api/material";
import { saveWorkflow } from "@/lib/api/workspace";
import { logger } from "@/lib/logger";
import { getTaskStopUrl, getTaskWaitUrl } from "@/lib/task/api-url";
import { exportWorkflow } from "@/lib/workflow/exporter";
import type { WorkflowExecutor } from "@/lib/workflow/parser";
import type { SSEMessage } from "@/types/sse";

const DATA_NODE_TYPES = [
    "textNode",
    "imageNode",
    "videoNode",
    "audioNode",
    "fileNode",
    "modelNode",
] as const;

function isDataNodeType(type: string | undefined): boolean {
    return !!type && (DATA_NODE_TYPES as readonly string[]).includes(type);
}

interface UseWorkflowExecutionArgs {
    nodes: Node[];
    edges: Edge[];
    workflowId: number | null;
    workflowName: string;
    workflowDescription: string;
    setWorkflowId: (id: number) => void;
    setWorkflowName: (name: string) => void;
    setWorkflowDescription: (desc: string) => void;
    updates: (nodeId: string, data: Record<string, unknown>) => void;
    defaultWorkflowName: string;
    t: (key: string) => string;
}

export interface UseWorkflowExecutionResult {
    showSaveDialog: boolean;
    setShowSaveDialog: (open: boolean) => void;
    tempName: string;
    setTempName: (v: string) => void;
    tempDescription: string;
    setTempDescription: (v: string) => void;
    isSaving: boolean;
    handleExecuteClick: () => void;
    handleSaveAndExecute: () => Promise<void>;
    handleStop: () => Promise<void>;
}

export function useWorkflowExecution(
    args: UseWorkflowExecutionArgs,
): UseWorkflowExecutionResult {
    const {
        nodes,
        edges,
        workflowId,
        workflowName,
        workflowDescription,
        setWorkflowId,
        setWorkflowName,
        setWorkflowDescription,
        updates,
        defaultWorkflowName,
        t,
    } = args;
    const tToast = useTranslations("Workspace.toast");

    const setWorkflowExecutionStatus = useTaskStore(
        (state) => state.setWorkflowExecutionStatus,
    );
    const setNodeExecutionStatus = useTaskStore(
        (state) => state.setNodeExecutionStatus,
    );
    const clearNodeExecutionStatus = useTaskStore(
        (state) => state.clearNodeExecutionStatus,
    );

    // Imperative refs survive re-renders without triggering them
    const executorRef = useRef<WorkflowExecutor | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const currentTaskIdRef = useRef<string | null>(null);
    // Replaces the previous (window as any).__cancelTimeoutId pollution
    const cancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Latest nodes/edges captured in a ref so SSE callbacks always see fresh canvas state
    // without forcing the EventSource to be torn down on every change.
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);
    useEffect(() => {
        edgesRef.current = edges;
    }, [edges]);

    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [tempName, setTempName] = useState("");
    const [tempDescription, setTempDescription] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const closeEventSource = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
    }, []);

    const clearCancelTimeout = useCallback(() => {
        if (cancelTimeoutRef.current) {
            clearTimeout(cancelTimeoutRef.current);
            cancelTimeoutRef.current = null;
        }
    }, []);

    // Write output payload to current node + propagate to direct downstream data nodes.
    // Only direct downstream data nodes receive a write; processing nodes read inputs lazily.
    const applyNodeOutput = useCallback(
        (
            sourceNodeId: string,
            output: { fileKeys?: string[]; texts?: string[] },
        ) => {
            const currentNodes = nodesRef.current;
            const currentEdges = edgesRef.current;

            const currentNode = currentNodes.find((n) => n.id === sourceNodeId);
            if (currentNode) {
                const currentData =
                    (currentNode.data as Record<string, unknown>) || {};
                const newData: Record<string, unknown> = { ...currentData };
                if (output.fileKeys && output.fileKeys.length > 0) {
                    newData.fileKeys = output.fileKeys;
                }
                if (output.texts && output.texts.length > 0) {
                    newData.texts = output.texts;
                }
                updates(sourceNodeId, newData);
                logger.debug(
                    "[workflow-exec] Updated node data:",
                    sourceNodeId,
                    newData,
                );
            }

            const downstreamEdges = currentEdges.filter(
                (e) => e.source === sourceNodeId,
            );
            for (const edge of downstreamEdges) {
                const downstreamNode = currentNodes.find(
                    (n) => n.id === edge.target,
                );
                if (!downstreamNode) continue;
                if (!isDataNodeType(downstreamNode.type)) continue;

                const downstreamData =
                    (downstreamNode.data as Record<string, unknown>) || {};
                const newDownstreamData: Record<string, unknown> = {
                    ...downstreamData,
                };
                if (output.fileKeys && output.fileKeys.length > 0) {
                    newDownstreamData.fileKeys = output.fileKeys;
                }
                if (output.texts && output.texts.length > 0) {
                    newDownstreamData.texts = output.texts;
                }
                updates(edge.target, newDownstreamData);
                logger.debug(
                    "[workflow-exec] Updated downstream data node:",
                    edge.target,
                    newDownstreamData,
                );
            }
        },
        [updates],
    );

    const handleExecute = useCallback(
        async (overrideWorkflowId: number) => {
            logger.debug(
                "[workflow-exec] Starting backend workflow execution (SSE)",
            );

            clearNodeExecutionStatus();
            setWorkflowExecutionStatus("running");

            try {
                const response = await fetch("/api/workflow/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workflowId: overrideWorkflowId }),
                });

                if (!response.ok) {
                    const errorData = (await response
                        .json()
                        .catch(() => ({}))) as {
                        code?: string;
                        error?: string;
                    };
                    throw new Error(
                        errorData.error ||
                            `API request failed: ${response.status}`,
                    );
                }

                const { taskId } = (await response.json()) as {
                    taskId: string;
                };
                logger.debug("[workflow-exec] Task created:", taskId);
                currentTaskIdRef.current = taskId;

                const sseUrl = getTaskWaitUrl(taskId);
                const eventSource = new EventSource(sseUrl);
                eventSourceRef.current = eventSource;

                eventSource.onopen = () => {
                    logger.debug("[workflow-exec] SSE connection opened");
                    emitSSEConnected(taskId);
                };

                eventSource.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data) as SSEMessage;
                        logger.debug("[workflow-exec] SSE received:", message);

                        emitSSETaskMessage({
                            id: taskId,
                            status: message.status,
                            nodeId: message.nodeId || null,
                            data: message.data,
                        });

                        switch (message.status) {
                            case WorkflowStatus.WORKFLOW_STARTED:
                                logger.debug(
                                    "[workflow-exec] Workflow started:",
                                    message.data?.totalNodes,
                                    "nodes",
                                );
                                break;

                            case NodeStatus.NODE_STARTED:
                            case NodeStatus.NODE_RUNNING:
                                if (message.nodeId) {
                                    setNodeExecutionStatus(
                                        message.nodeId,
                                        "running",
                                    );
                                }
                                break;

                            case "NODE_PROGRESS":
                                if (message.nodeId) {
                                    logger.debug(
                                        "[workflow-exec] Node progress:",
                                        message.nodeId,
                                        message.data?.progress,
                                    );
                                }
                                break;

                            case NodeStatus.NODE_COMPLETED:
                                if (message.nodeId) {
                                    setNodeExecutionStatus(
                                        message.nodeId,
                                        "completed",
                                    );
                                    const output = message.data?.output;
                                    if (output) {
                                        applyNodeOutput(message.nodeId, {
                                            fileKeys: output.fileKeys,
                                            texts: output.texts,
                                        });
                                    }
                                }
                                break;

                            case NodeStatus.NODE_FAILED:
                                if (message.nodeId) {
                                    setNodeExecutionStatus(
                                        message.nodeId,
                                        "failed",
                                    );
                                }
                                break;

                            case WorkflowStatus.WORKFLOW_COMPLETED:
                            case TaskStatus.COMPLETED:
                                logger.debug(
                                    "[workflow-exec] Workflow completed",
                                );
                                setWorkflowExecutionStatus("completed");
                                saveFromTask({
                                    taskId,
                                    status: message.status,
                                    data: message.data,
                                })
                                    .then((result) => {
                                        logger.debug(
                                            "[workflow-exec] Frontend backup save:",
                                            result,
                                        );
                                    })
                                    .catch((err) => {
                                        logger.warn(
                                            "[workflow-exec] Frontend backup save failed:",
                                            err,
                                        );
                                    });
                                closeEventSource();
                                currentTaskIdRef.current = null;
                                break;

                            case WorkflowStatus.WORKFLOW_CANCELLED:
                            case TaskStatus.CANCELLED:
                                logger.debug(
                                    "[workflow-exec] Workflow cancelled by user",
                                );
                                saveFromTask({
                                    taskId,
                                    status: message.status,
                                    data: message.data,
                                }).catch((err) => {
                                    logger.warn(
                                        "[workflow-exec] saveFromTask (cancel) failed:",
                                        err,
                                    );
                                });
                                clearCancelTimeout();
                                clearNodeExecutionStatus();
                                setWorkflowExecutionStatus("idle");
                                closeEventSource();
                                currentTaskIdRef.current = null;
                                if (executorRef.current) {
                                    executorRef.current.stop();
                                    executorRef.current = null;
                                }
                                break;

                            case WorkflowStatus.WORKFLOW_FAILED:
                            case TaskStatus.FAILED:
                                logger.debug(
                                    "[workflow-exec] Workflow failed:",
                                    message.data?.error,
                                );
                                saveFromTask({
                                    taskId,
                                    status: message.status,
                                    data: message.data,
                                }).catch((err) => {
                                    logger.warn(
                                        "[workflow-exec] saveFromTask (fail) failed:",
                                        err,
                                    );
                                });
                                setWorkflowExecutionStatus("failed");
                                closeEventSource();
                                currentTaskIdRef.current = null;
                                break;

                            default:
                                logger.debug(
                                    "[workflow-exec] Unknown SSE status:",
                                    message.status,
                                );
                        }
                    } catch (e) {
                        logger.error(
                            "[workflow-exec] Failed to parse SSE message:",
                            e,
                        );
                    }
                };

                eventSource.onerror = (error) => {
                    logger.error(
                        "[workflow-exec] SSE connection error:",
                        error,
                    );
                    setWorkflowExecutionStatus("failed");
                    closeEventSource();
                };
            } catch (error) {
                logger.error("[workflow-exec] Execution failed:", error);
                setWorkflowExecutionStatus("failed");
            }
        },
        [
            applyNodeOutput,
            clearCancelTimeout,
            clearNodeExecutionStatus,
            closeEventSource,
            setNodeExecutionStatus,
            setWorkflowExecutionStatus,
        ],
    );

    const handleExecuteClick = useCallback(() => {
        // Always open the save dialog so the latest canvas is persisted before exec
        setTempName(workflowName || defaultWorkflowName);
        setTempDescription(workflowDescription || "");
        setShowSaveDialog(true);
    }, [workflowName, workflowDescription, defaultWorkflowName]);

    const handleSaveAndExecute = useCallback(async () => {
        const effectiveName = workflowId ? workflowName : tempName;
        const effectiveDescription = workflowId
            ? workflowDescription
            : tempDescription;

        if (!effectiveName?.trim()) {
            toast.error(t("enterWorkflowName"));
            return;
        }

        setIsSaving(true);
        try {
            const executable = exportWorkflow(nodes, edges, {
                name: effectiveName,
                description: effectiveDescription || "",
                includeOriginalFlow: false,
            });

            const result = await saveWorkflow({
                ...(workflowId ? { workflowId } : {}),
                name: effectiveName,
                description: effectiveDescription || "",
                flow: { nodes, edges },
                executable,
            });

            setWorkflowId(result.workflowId);
            setWorkflowName(effectiveName);
            setWorkflowDescription(effectiveDescription || "");
            toast.success(t("saveSuccess"));

            setShowSaveDialog(false);
            // Pass the freshly-saved id to avoid the stale closure issue
            handleExecute(result.workflowId);
        } catch (error) {
            logger.error("[workflow-exec] Save failed:", error);
            toast.error(t("saveFailed"));
        } finally {
            setIsSaving(false);
        }
    }, [
        workflowId,
        workflowName,
        workflowDescription,
        tempName,
        tempDescription,
        nodes,
        edges,
        setWorkflowId,
        setWorkflowName,
        setWorkflowDescription,
        handleExecute,
        t,
    ]);

    const cleanupAfterCancel = useCallback(() => {
        closeEventSource();
        if (executorRef.current) {
            executorRef.current.stop();
            executorRef.current = null;
        }
        clearNodeExecutionStatus();
        setWorkflowExecutionStatus("idle");
        currentTaskIdRef.current = null;
    }, [
        closeEventSource,
        clearNodeExecutionStatus,
        setWorkflowExecutionStatus,
    ]);

    const handleStop = useCallback(async () => {
        logger.debug("[workflow-exec] Stop requested");
        const taskIdToCancel = currentTaskIdRef.current;

        if (taskIdToCancel) {
            emitSSETaskMessage({
                id: taskIdToCancel,
                status: TaskStatus.RUNNING,
                nodeId: null,
                data: { message: tToast("cancelling") },
            });
        }

        if (!taskIdToCancel) {
            cleanupAfterCancel();
            return;
        }

        try {
            const response = await fetch(getTaskStopUrl(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: taskIdToCancel }),
            });

            if (!response.ok) {
                throw new Error(`Stop request failed: ${response.status}`);
            }

            // Backend accepted cancel — wait up to 10s for the SSE CANCELLED message;
            // if it never arrives, surface cancel manually so the UI doesn't hang.
            cancelTimeoutRef.current = setTimeout(() => {
                logger.debug(
                    "[workflow-exec] Timeout waiting for CANCELLED, emitting manually",
                );
                emitSSETaskMessage({
                    id: taskIdToCancel,
                    status: TaskStatus.CANCELLED,
                    nodeId: null,
                    data: { message: tToast("cancelled") },
                });
                cleanupAfterCancel();
                cancelTimeoutRef.current = null;
            }, 10000);
        } catch (error) {
            logger.error("[workflow-exec] Failed to send stop request:", error);
            emitSSETaskMessage({
                id: taskIdToCancel,
                status: TaskStatus.CANCELLED,
                nodeId: null,
                data: { message: tToast("cancelled") },
            });
            cleanupAfterCancel();
        }
    }, [cleanupAfterCancel, tToast]);

    // External cancel button (TaskProgressToast) dispatches this window event
    useEffect(() => {
        const handleCancelRequest = () => {
            if (currentTaskIdRef.current) {
                logger.debug(
                    "[workflow-exec] Received cancel request from toast",
                );
                void handleStop();
            }
        };
        window.addEventListener("task-cancel-request", handleCancelRequest);
        return () => {
            window.removeEventListener(
                "task-cancel-request",
                handleCancelRequest,
            );
        };
    }, [handleStop]);

    // Cleanup on unmount: close any open SSE, clear pending cancel timer
    useEffect(() => {
        return () => {
            closeEventSource();
            clearCancelTimeout();
        };
    }, [closeEventSource, clearCancelTimeout]);

    return {
        showSaveDialog,
        setShowSaveDialog,
        tempName,
        setTempName,
        tempDescription,
        setTempDescription,
        isSaving,
        handleExecuteClick,
        handleSaveAndExecute,
        handleStop,
    };
}
