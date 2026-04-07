/**
 * 工作流任务恢复 Hook
 * 页面刷新后自动恢复正在执行的工作流任务
 *
 * 流程：
 * 1. 页面加载时调用 /api/task/pending 获取最新未完成的工作流任务
 * 2. 如果有未完成任务，使用 reconnect 模式连接 SSE
 * 3. 继续接收任务进度并更新 UI
 */

import { useEffect, useCallback, useRef } from "react";
import { useTaskStore } from "./use-task";
import {
    emitSSETaskMessage,
    emitSSEConnected,
} from "@/components/workspace/task-progress-toast";
import {
    TaskStatus,
    WorkflowStatus,
    NodeStatus,
} from "@/constants/task-status";
import { getTaskWaitUrl } from "@/lib/task-api-url";

interface UseWorkflowRecoveryOptions {
    /** 节点状态更新回调 */
    onNodeStatusChange?: (nodeId: string, status: string) => void;
    /** 节点数据更新回调 */
    onNodeDataUpdate?: (
        nodeId: string,
        data: { fileKeys?: string[]; texts?: string[] },
    ) => void;
    /** 工作流完成回调 */
    onWorkflowComplete?: (data?: Record<string, unknown>) => void;
    /** 工作流失败回调 */
    onWorkflowFailed?: (error?: string) => void;
    /** 工作流取消回调 */
    onWorkflowCancelled?: () => void;
}

interface RecoveryState {
    taskId: string | null;
    eventSource: EventSource | null;
    hasAttemptedRecovery: boolean; // 是否已尝试恢复
}

/**
 * 工作流任务恢复 Hook
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

    // 清理函数
    const cleanup = useCallback(() => {
        if (recoveryStateRef.current.eventSource) {
            recoveryStateRef.current.eventSource.close();
            recoveryStateRef.current.eventSource = null;
        }
        recoveryStateRef.current.taskId = null;
    }, []);

    // 处理 SSE 消息
    const handleSSEMessage = useCallback(
        (
            taskId: string,
            message: {
                status: string;
                nodeId?: string;
                data?: Record<string, unknown>;
            },
        ) => {
            console.log("[WorkflowRecovery] SSE message:", message);

            // 触发 SSE 消息事件，更新进度浮动提示
            emitSSETaskMessage({
                id: taskId,
                status: message.status as any,
                nodeId: message.nodeId || null,
                data: message.data as any,
            });

            switch (message.status) {
                case WorkflowStatus.WORKFLOW_STARTED:
                    console.log("[WorkflowRecovery] Workflow started");
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
                        const output = message.data?.output as
                            | { fileKeys?: string[]; texts?: string[] }
                            | undefined;
                        if (output) {
                            onNodeDataUpdate?.(message.nodeId, output);
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
                case "FINISHED":
                    console.log("[WorkflowRecovery] ✅ Workflow completed");
                    setWorkflowExecutionStatus("completed");
                    cleanup();
                    onWorkflowComplete?.(message.data);
                    break;

                case WorkflowStatus.WORKFLOW_CANCELLED:
                case TaskStatus.CANCELLED:
                    console.log("[WorkflowRecovery] ⚠️ Workflow cancelled");
                    clearNodeExecutionStatus();
                    setWorkflowExecutionStatus("idle");
                    cleanup();
                    onWorkflowCancelled?.();
                    break;

                case WorkflowStatus.WORKFLOW_FAILED:
                case TaskStatus.FAILED:
                case "ERROR":
                    console.log(
                        "[WorkflowRecovery] ❌ Workflow failed:",
                        message.data?.error,
                    );
                    setWorkflowExecutionStatus("failed");
                    cleanup();
                    onWorkflowFailed?.(message.data?.error as string);
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

    // 重新连接 SSE
    const reconnectSSE = useCallback(
        (taskId: string) => {
            console.log(
                "[WorkflowRecovery] Reconnecting SSE for task:",
                taskId,
            );

            const sseUrl = getTaskWaitUrl(taskId, true);
            const eventSource = new EventSource(sseUrl);

            recoveryStateRef.current.taskId = taskId;
            recoveryStateRef.current.eventSource = eventSource;

            eventSource.onopen = () => {
                console.log("[WorkflowRecovery] SSE reconnected successfully");
                emitSSEConnected(taskId);
            };

            eventSource.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    handleSSEMessage(taskId, message);
                } catch (e) {
                    console.error(
                        "[WorkflowRecovery] Failed to parse SSE message:",
                        e,
                    );
                }
            };

            eventSource.onerror = (error) => {
                console.error(
                    "[WorkflowRecovery] SSE connection error:",
                    error,
                );
                // 连接失败，任务可能已完成
                setWorkflowExecutionStatus("idle");
                cleanup();
            };

            return eventSource;
        },
        [handleSSEMessage, setWorkflowExecutionStatus, cleanup],
    );

    // 尝试恢复任务 - 从数据库查询最新未完成任务
    const tryRecoverTask = useCallback(async () => {
        // 防止重复执行
        if (recoveryStateRef.current.hasAttemptedRecovery) {
            return false;
        }
        recoveryStateRef.current.hasAttemptedRecovery = true;

        try {
            console.log(
                "[WorkflowRecovery] Checking for pending workflow tasks...",
            );

            const response = await fetch("/api/task/pending");
            if (!response.ok) {
                console.log("[WorkflowRecovery] Failed to fetch pending task");
                return false;
            }

            const data: { task: { id: string; status: string } | null } =
                await response.json();
            const { task } = data;

            if (!task) {
                console.log(
                    "[WorkflowRecovery] No pending workflow task found",
                );
                return false;
            }

            console.log(
                "[WorkflowRecovery] Found pending task:",
                task.id,
                "status:",
                task.status,
            );

            // 有未完成任务，尝试重连 SSE
            setWorkflowExecutionStatus("running");
            reconnectSSE(task.id);
            return true;
        } catch (error) {
            console.error(
                "[WorkflowRecovery] Failed to check pending tasks:",
                error,
            );
            return false;
        }
    }, [setWorkflowExecutionStatus, reconnectSSE]);

    // 页面加载时自动尝试恢复（只执行一次）
    useEffect(() => {
        // 延迟执行，等待组件完全挂载
        const timer = setTimeout(() => {
            tryRecoverTask();
        }, 800);

        return () => {
            clearTimeout(timer);
            // 组件卸载时关闭 SSE 连接
            if (recoveryStateRef.current.eventSource) {
                recoveryStateRef.current.eventSource.close();
            }
        };
    }, [tryRecoverTask]);

    return {
        /** 手动尝试恢复任务 */
        tryRecoverTask,
        /** 获取当前恢复中的任务 ID */
        getRecoveringTaskId: () => recoveryStateRef.current.taskId,
        /** 清理恢复状态 */
        cleanup,
    };
}
