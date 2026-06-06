/**
 * Workflow task recovery hook
 * Automatically recover running workflow tasks after page refresh
 *
 * Flow:
 * 1. Call /api/task/pending on page load to get the latest unfinished workflow task
 * 2. If there is an unfinished task, connect to SSE in reconnect mode
 * 3. Continue receiving task progress and update the UI
 */

import { useCallback, useEffect, useRef } from "react";
import {
    NodeStatus,
    TaskStatus,
    WorkflowStatus,
} from "@/constants/task-status";
import { logger } from "@/lib/logger";
import { getTaskWaitUrl } from "@/lib/task/api-url";
import { emitSSEConnected, emitSSETaskMessage } from "@/lib/task/sse-events";
import type { SSEMessage, SSEStatus } from "@/types/sse";
import { useTaskStore } from "./use-task";

interface UseWorkflowRecoveryOptions {
    /** Node status update callback */
    onNodeStatusChange?: (nodeId: string, status: string) => void;
    /** Node data update callback */
    onNodeDataUpdate?: (
        nodeId: string,
        data: { fileKeys?: string[]; texts?: string[] },
    ) => void;
    /** Workflow completion callback */
    onWorkflowComplete?: (data?: Record<string, unknown>) => void;
    /** Workflow failure callback */
    onWorkflowFailed?: (error?: string) => void;
    /** Workflow cancellation callback */
    onWorkflowCancelled?: () => void;
}

interface RecoveryState {
    taskId: string | null;
    eventSource: EventSource | null;
    hasAttemptedRecovery: boolean; // Whether recovery has already been attempted
}

/**
 * Workflow task recovery hook
 */
export function useWorkflowRecovery(options: UseWorkflowRecoveryOptions = {}) {
    const {
        onNodeStatusChange,
        onNodeDataUpdate,
        onWorkflowComplete,
        onWorkflowFailed,
        onWorkflowCancelled,
    } = options;

    const {
        setWorkflowExecutionStatus,
        setNodeExecutionStatus,
        clearNodeExecutionStatus,
    } = useTaskStore();

    const recoveryStateRef = useRef<RecoveryState>({
        taskId: null,
        eventSource: null,
        hasAttemptedRecovery: false,
    });

    // Cleanup timers + listeners helper
    const cleanup = useCallback(() => {
        if (recoveryStateRef.current.eventSource) {
            recoveryStateRef.current.eventSource.close();
            recoveryStateRef.current.eventSource = null;
        }
        recoveryStateRef.current.taskId = null;
    }, []);

    // Handle SSE messages
    const handleSSEMessage = useCallback(
        (
            taskId: string,
            message: {
                status: SSEStatus;
                nodeId?: string;
                data?: SSEMessage["data"];
            },
        ) => {
            logger.debug("[WorkflowRecovery] SSE message:", message);

            // Bubble SSE deltas into floating progress toast
            emitSSETaskMessage({
                id: taskId,
                status: message.status,
                nodeId: message.nodeId || null,
                data: message.data,
            });

            switch (message.status) {
                case WorkflowStatus.WORKFLOW_STARTED:
                    logger.debug("[WorkflowRecovery] Workflow started");
                    break;

                case NodeStatus.NODE_STARTED:
                case NodeStatus.NODE_RUNNING:
                    if (message.nodeId) {
                        setNodeExecutionStatus(message.nodeId, "running");
                        onNodeStatusChange?.(message.nodeId, "running");
                    }
                    break;

                case NodeStatus.NODE_COMPLETED:
                    if (message.nodeId) {
                        setNodeExecutionStatus(message.nodeId, "completed");
                        onNodeStatusChange?.(message.nodeId, "completed");
                        const output = message.data?.output;
                        if (output) {
                            onNodeDataUpdate?.(message.nodeId, {
                                fileKeys: output.fileKeys,
                                texts: output.texts,
                            });
                        }
                    }
                    break;

                case NodeStatus.NODE_FAILED:
                    if (message.nodeId) {
                        setNodeExecutionStatus(message.nodeId, "failed");
                        onNodeStatusChange?.(message.nodeId, "failed");
                    }
                    break;

                case WorkflowStatus.WORKFLOW_COMPLETED:
                case TaskStatus.COMPLETED:
                    logger.debug("[WorkflowRecovery] ✅ Workflow completed");
                    setWorkflowExecutionStatus("completed");
                    cleanup();
                    onWorkflowComplete?.(message.data);
                    break;

                case WorkflowStatus.WORKFLOW_CANCELLED:
                case TaskStatus.CANCELLED:
                    logger.debug("[WorkflowRecovery] ⚠️ Workflow cancelled");
                    clearNodeExecutionStatus();
                    setWorkflowExecutionStatus("idle");
                    cleanup();
                    onWorkflowCancelled?.();
                    break;

                case WorkflowStatus.WORKFLOW_FAILED:
                case TaskStatus.FAILED:
                    logger.debug(
                        "[WorkflowRecovery] ❌ Workflow failed:",
                        message.data?.error,
                    );
                    setWorkflowExecutionStatus("failed");
                    cleanup();
                    onWorkflowFailed?.(message.data?.error);
                    break;
            }
        },
        [
            setWorkflowExecutionStatus,
            setNodeExecutionStatus,
            clearNodeExecutionStatus,
            onNodeStatusChange,
            onNodeDataUpdate,
            onWorkflowComplete,
            onWorkflowFailed,
            onWorkflowCancelled,
            cleanup,
        ],
    );

    // Reconnect SSE
    const reconnectSSE = useCallback(
        (taskId: string) => {
            logger.debug(
                "[WorkflowRecovery] Reconnecting SSE for task:",
                taskId,
            );

            const sseUrl = getTaskWaitUrl(taskId, true);
            const eventSource = new EventSource(sseUrl);

            recoveryStateRef.current.taskId = taskId;
            recoveryStateRef.current.eventSource = eventSource;

            eventSource.onopen = () => {
                logger.debug("[WorkflowRecovery] SSE reconnected successfully");
                emitSSEConnected(taskId);
            };

            eventSource.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data) as SSEMessage;
                    handleSSEMessage(taskId, {
                        status: message.status,
                        nodeId: message.nodeId ?? undefined,
                        data: message.data,
                    });
                } catch (e) {
                    logger.error(
                        "[WorkflowRecovery] Failed to parse SSE message:",
                        e,
                    );
                }
            };

            eventSource.onerror = (error) => {
                logger.error("[WorkflowRecovery] SSE connection error:", error);
                // Connection failed; the task may already be complete
                setWorkflowExecutionStatus("idle");
                cleanup();
            };

            return eventSource;
        },
        [handleSSEMessage, setWorkflowExecutionStatus, cleanup],
    );

    // Try to recover the task - query the latest unfinished task from the database
    const tryRecoverTask = useCallback(async () => {
        // Prevent duplicate execution
        if (recoveryStateRef.current.hasAttemptedRecovery) {
            return false;
        }
        recoveryStateRef.current.hasAttemptedRecovery = true;

        try {
            logger.debug(
                "[WorkflowRecovery] Checking for pending workflow tasks...",
            );

            const response = await fetch("/api/task/pending");
            if (!response.ok) {
                logger.debug("[WorkflowRecovery] Failed to fetch pending task");
                return false;
            }

            const data: { task: { id: string; status: string } | null } =
                await response.json();
            const { task } = data;

            if (!task) {
                logger.debug(
                    "[WorkflowRecovery] No pending workflow task found",
                );
                return false;
            }

            logger.debug(
                "[WorkflowRecovery] Found pending task:",
                task.id,
                "status:",
                task.status,
            );

            // An unfinished task exists; try reconnecting SSE
            setWorkflowExecutionStatus("running");
            reconnectSSE(task.id);
            return true;
        } catch (error) {
            logger.error(
                "[WorkflowRecovery] Failed to check pending tasks:",
                error,
            );
            return false;
        }
    }, [setWorkflowExecutionStatus, reconnectSSE]);

    // Automatically try recovery on page load (only once)
    useEffect(() => {
        // Run after a delay so the component can fully mount
        const timer = setTimeout(() => {
            tryRecoverTask();
        }, 800);

        return () => {
            clearTimeout(timer);
            // Close the SSE connection when the component unmounts
            if (recoveryStateRef.current.eventSource) {
                recoveryStateRef.current.eventSource.close();
            }
        };
    }, [tryRecoverTask]);

    return {
        /** Manually try task recovery */
        tryRecoverTask,
        /** Get the currently recovering task ID */
        getRecoveringTaskId: () => recoveryStateRef.current.taskId,
        /** Clear recovery state */
        cleanup,
    };
}
