/**
 * Task management hook.
 * Uses SSE (Server-Sent Events) for realtime task updates.
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { create } from "zustand";
import {
    isTerminalStatus,
    mapSSEStatusToTaskStatus,
    type SSEStatusType,
    TaskStatus,
} from "@/constants/task-status";
import { createTask as apiCreateTask, updateTaskStatus } from "@/lib/api/task";
import { logger } from "@/lib/logger";
import { getTaskStopUrl, getTaskWaitUrl } from "@/lib/task/api-url";
import {
    emitSSEConnected,
    emitSSETaskMessage,
    TASK_CANCEL_REQUEST_EVENT,
} from "@/lib/task/sse-events";
import type { SSEMessage } from "@/types/sse";

// SSE message shape for the `/api/task/wait` stream
interface SSETaskMessage {
    id: string;
    status: SSEStatusType;
    data?: Record<string, unknown>;
    progress?: number;
    error?: string;
    /** Optional field from backend (e.g. workflow NODE_* metadata) */
    nodeId?: string | null;
}

function emitTaskProgressFromSSE(payload: SSETaskMessage) {
    const nodeId =
        payload.nodeId != null && payload.nodeId !== ""
            ? String(payload.nodeId)
            : null;
    emitSSETaskMessage({
        id: payload.id,
        status: payload.status,
        nodeId,
        data: payload.data as SSEMessage["data"],
    });
}

// -------------------- Type definitions --------------------

export interface Task {
    id: string;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
    data?: Record<string, unknown>;
    progress?: number;
    result?: unknown;
    error?: string;
    nodeId?: string; // Linked node id
}

// Node handler map: taskId -> nodeId -> handler
export type NodeTaskHandler = (task: Task) => void;

// Workspace mode type
export type WorkspaceMode = "create" | "execute";

// Workflow execution status
export type WorkflowExecutionStatus =
    | "idle" // Idle
    | "running" // Running
    | "paused" // Paused
    | "completed" // Completed
    | "failed"; // Failed

export const WORKSPACE_MODE_KEY = "workspace-mode";

export interface TaskState {
    tasks: Map<string, Task>;
    // Workspace mode
    workspaceMode: WorkspaceMode;
    setWorkspaceMode: (mode: WorkspaceMode) => void;
    // Workflow execution status
    workflowExecutionStatus: WorkflowExecutionStatus;
    setWorkflowExecutionStatus: (status: WorkflowExecutionStatus) => void;
    // Current execution level
    currentExecutionLevel: number;
    setCurrentExecutionLevel: (level: number) => void;
    // Node id -> execution status
    nodeExecutionStatusMap: Map<string, string>; // nodeId -> status
    setNodeExecutionStatus: (nodeId: string, status: string) => void;
    clearNodeExecutionStatus: () => void;
    // trackTaskToNode(taskId, nodeId) remembers which node created the task
    taskNodeMap: Map<string, string>; // taskId -> nodeId
    // registerNodeHandler(nodeId, handler) registers per-node handlers
    nodeHandlers: Map<string, NodeTaskHandler[]>; // nodeId -> handlers[]
    setTask: (taskId: string | number, task: Task) => void;
    getTask: (taskId: string | number) => Task | undefined;
    removeTask: (taskId: string | number) => void;
    clearCompletedTasks: () => void;
    getActiveTasks: () => Task[];
    hasActiveTasks: () => boolean;
    // Track task -> node association
    trackTaskToNode: (taskId: string, nodeId: string) => void;
    // Resolve node id for a task id
    getTaskNodeId: (taskId: string) => string | undefined;
    // Register handlers for a node
    registerNodeHandler: (nodeId: string, handler: NodeTaskHandler) => void;
    // Unregister handlers for a node
    unregisterNodeHandler: (nodeId: string, handler: NodeTaskHandler) => void;
    // Deliver task updates to the owning node handlers
    routeTaskToNode: (task: Task) => void;
}

// Single-task creation payload
export interface TaskCreationConfig {
    feature: string;
    pluginId: string;
    prompt: Record<string, unknown>;
    nodeId: string;
    workflowId?: number;
}

// Batch task options
export interface BatchTaskConfig {
    onBatchComplete?: (tasks: Task[]) => void;
    onProgress?: (completed: number, total: number) => void;
}

// Task subscription options
export interface TaskSubscriptionOptions {
    onError?: (error: unknown) => void;
    maxRetries?: number;
    retryDelay?: number;
    onTaskUpdate?: (task: Task) => void;
    // Connection callback: connecting | connected | reconnecting | disconnected | error
    onStatusChange?: (
        status:
            | "connecting"
            | "connected"
            | "reconnecting"
            | "disconnected"
            | "error",
    ) => void;
}

// Default SSE client settings
const SSE_DEFAULT_MAX_RETRIES = 10; // Up to 10 reconnect attempts
const SSE_DEFAULT_RETRY_DELAY = 2000; // Base delay 2s
const SSE_MAX_RETRY_DELAY = 30000; // Cap at 30s

// -------------------- Zustand Store --------------------

export const useTaskStore = create<TaskState>((set, get) => ({
    tasks: new Map(),
    taskNodeMap: new Map(), // taskId -> nodeId
    nodeHandlers: new Map(), // nodeId -> handlers
    // Default workspace mode "create" to avoid SSR/client hydration mismatch
    // After hydration, useEffect restores from localStorage
    workspaceMode: "create" as WorkspaceMode,

    // Workflow execution status
    workflowExecutionStatus: "idle" as WorkflowExecutionStatus,
    currentExecutionLevel: -1,
    nodeExecutionStatusMap: new Map(),

    setWorkspaceMode: (mode) => {
        if (typeof window !== "undefined") {
            localStorage.setItem(WORKSPACE_MODE_KEY, mode);
        }
        set({ workspaceMode: mode });
    },

    setWorkflowExecutionStatus: (status) => {
        set({ workflowExecutionStatus: status });
    },

    setCurrentExecutionLevel: (level) => {
        set({ currentExecutionLevel: level });
    },

    setNodeExecutionStatus: (nodeId, status) => {
        set((state) => {
            const newMap = new Map(state.nodeExecutionStatusMap);
            newMap.set(nodeId, status);
            return { nodeExecutionStatusMap: newMap };
        });
    },

    clearNodeExecutionStatus: () => {
        set({ nodeExecutionStatusMap: new Map(), currentExecutionLevel: -1 });
    },

    setTask: (taskId, task) =>
        set((state) => {
            const newTasks = new Map(state.tasks);
            newTasks.set(String(taskId), task);
            return { tasks: newTasks };
        }),

    getTask: (taskId) => get().tasks.get(String(taskId)),

    removeTask: (taskId) =>
        set((state) => {
            const newTasks = new Map(state.tasks);
            const taskIdStr = String(taskId);
            newTasks.delete(taskIdStr);

            // Drop task-node mapping as well
            const newTaskNodeMap = new Map(state.taskNodeMap);
            newTaskNodeMap.delete(taskIdStr);

            return { tasks: newTasks, taskNodeMap: newTaskNodeMap };
        }),

    clearCompletedTasks: () =>
        set((state) => {
            const newTasks = new Map();
            const newTaskNodeMap = new Map(state.taskNodeMap);

            for (const [taskId, task] of state.tasks) {
                if (task.status === "PENDING" || task.status === "PROCESSING") {
                    newTasks.set(taskId, task);
                } else {
                    // Drop node mapping for finished tasks
                    newTaskNodeMap.delete(taskId);
                }
            }
            logger.debug(
                `[Task Store] Cleared completed tasks, ${
                    state.tasks.size - newTasks.size
                } tasks removed`,
            );
            return { tasks: newTasks, taskNodeMap: newTaskNodeMap };
        }),

    getActiveTasks: () => {
        const tasks = Array.from(get().tasks.values());
        return tasks.filter(
            (task) => task.status === "PENDING" || task.status === "PROCESSING",
        );
    },

    hasActiveTasks: () => {
        const tasks = Array.from(get().tasks.values());
        return tasks.some(
            (task) => task.status === "PENDING" || task.status === "PROCESSING",
        );
    },

    // Track task -> node
    trackTaskToNode: (taskId, nodeId) => {
        set((state) => {
            const newTaskNodeMap = new Map(state.taskNodeMap);
            newTaskNodeMap.set(taskId, nodeId);
            logger.debug(
                `[Task Store] Task ${taskId} tracked to node ${nodeId}`,
            );
            return { taskNodeMap: newTaskNodeMap };
        });
    },

    // Resolve node id for a task
    getTaskNodeId: (taskId) => get().taskNodeMap.get(taskId),

    // Register node handler
    registerNodeHandler: (nodeId, handler) => {
        set((state) => {
            const newNodeHandlers = new Map(state.nodeHandlers);
            const handlers = newNodeHandlers.get(nodeId) || [];
            handlers.push(handler);
            newNodeHandlers.set(nodeId, handlers);
            logger.debug(
                `[Task Store] Registered handler for node ${nodeId}, total handlers: ${handlers.length}`,
            );
            return { nodeHandlers: newNodeHandlers };
        });
    },

    // Unregister node handler
    unregisterNodeHandler: (nodeId, handler) => {
        set((state) => {
            const newNodeHandlers = new Map(state.nodeHandlers);
            const handlers = newNodeHandlers.get(nodeId) || [];
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
            if (handlers.length === 0) {
                newNodeHandlers.delete(nodeId);
            } else {
                newNodeHandlers.set(nodeId, handlers);
            }
            logger.debug(
                `[Task Store] Unregistered handler for node ${nodeId}, remaining handlers: ${handlers.length}`,
            );
            return { nodeHandlers: newNodeHandlers };
        });
    },

    // Route task updates to handlers
    routeTaskToNode: (task) => {
        const state = get();
        const nodeId =
            state.taskNodeMap.get(task.id) ??
            (task.nodeId ? String(task.nodeId) : undefined);

        if (nodeId) {
            const handlers = state.nodeHandlers.get(nodeId) || [];
            logger.debug(
                `[Task Router] Routing task ${task.id} (status: ${task.status}) to node ${nodeId}, handlers: ${handlers.length}`,
            );

            handlers.forEach((handler) => {
                try {
                    handler(task);
                } catch (error) {
                    logger.error(
                        `[Task Router] Error calling handler for node ${nodeId}:`,
                        error,
                    );
                }
            });
        } else {
            logger.warn(
                `[Task Router] No node found for task ${task.id}, storing in global store only`,
            );
        }
    },
}));

// -------------------- Realtime subscription hook --------------------

/**
 * Subscribe to task updates over SSE (Server-Sent Events).
 * Handles connection lifecycle, reconnect, and parsing.
 */
export function useTaskSubscription(
    taskId?: string,
    options?: TaskSubscriptionOptions,
) {
    const t = useTranslations("Workspace.toast");
    const { setTask, routeTaskToNode } = useTaskStore();
    const [status, setStatus] = useState<
        "connecting" | "connected" | "reconnecting" | "disconnected" | "error"
    >("disconnected");
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const maxRetries = options?.maxRetries ?? SSE_DEFAULT_MAX_RETRIES;
    const baseRetryDelay = options?.retryDelay ?? SSE_DEFAULT_RETRY_DELAY;

    useEffect(() => {
        if (!taskId) {
            setStatus("disconnected");
            return;
        }

        let isSubscribed = true;

        const connect = () => {
            if (!isSubscribed) return;

            try {
                setStatus(
                    reconnectAttemptsRef.current > 0
                        ? "reconnecting"
                        : "connecting",
                );

                // Open SSE connection
                const eventSource = new EventSource(getTaskWaitUrl(taskId));
                eventSourceRef.current = eventSource;

                eventSource.onopen = () => {
                    if (!isSubscribed) return;
                    setStatus("connected");
                    reconnectAttemptsRef.current = 0;
                    // Emit SSE connected
                    emitSSEConnected(taskId);
                    if (options?.onStatusChange) {
                        options.onStatusChange("connected");
                    }
                };

                eventSource.onmessage = (event) => {
                    if (!isSubscribed) return;

                    try {
                        const message: SSETaskMessage = JSON.parse(event.data);
                        logger.debug(`[SSE] Received message:`, message);

                        emitTaskProgressFromSSE(message);

                        const taskStatus = mapSSEStatusToTaskStatus(
                            message.status,
                        );

                        const msgNodeId = message.nodeId;

                        const internalTask: Task = {
                            id: message.id,
                            status: taskStatus,
                            progress: message.progress || 0,
                            data: message.data,
                            error:
                                message.error ||
                                ((message.data as Record<string, unknown>)
                                    ?.error as string),
                            nodeId:
                                (msgNodeId != null && msgNodeId !== ""
                                    ? String(msgNodeId)
                                    : undefined) ??
                                useTaskStore
                                    .getState()
                                    .getTaskNodeId(message.id),
                        };

                        // Update global task store
                        setTask(internalTask.id, internalTask);
                        logger.debug(
                            `[SSE] Task updated: ${internalTask.id} (${internalTask.status})`,
                        );

                        // Toast on success; failures are surfaced globally by
                        // TaskFailureToaster (persistent error toast).
                        if (taskStatus === "COMPLETED") {
                            toast.success(t("taskCompleted"));
                        }

                        // Frontend backup: persist terminal status without saving materials
                        if (isTerminalStatus(message.status)) {
                            updateTaskStatus({
                                taskId: message.id,
                                status: message.status,
                                data: message.data,
                            }).catch((error) => {
                                logger.error(
                                    "[SSE] Failed to update task status (frontend backup):",
                                    error,
                                );
                            });
                        }

                        // Route to node handlers
                        routeTaskToNode(internalTask);

                        // Invoke optional subscriber
                        if (options?.onTaskUpdate) {
                            options.onTaskUpdate(internalTask);
                        }

                        // Terminal status: tear down the stream and disable
                        // reconnect. The wait endpoint closes the connection
                        // on terminal state, and a reconnect without
                        // `reconnect=true` re-executes the task — that is
                        // exactly the unwanted "auto retry" behavior.
                        if (isTerminalStatus(message.status)) {
                            isSubscribed = false;
                            if (reconnectTimeoutRef.current) {
                                clearTimeout(reconnectTimeoutRef.current);
                                reconnectTimeoutRef.current = null;
                            }
                            eventSource.close();
                            eventSourceRef.current = null;
                            setStatus("disconnected");
                            if (options?.onStatusChange) {
                                options.onStatusChange("disconnected");
                            }
                        }
                    } catch (error) {
                        logger.error(
                            "[SSE] Error parsing message:",
                            error,
                            event.data,
                        );
                    }
                };

                // Backend may emit custom `close` event
                eventSource.addEventListener("close", () => {
                    logger.debug("[SSE] Server sent close event");
                    if (!isSubscribed) return;
                    isSubscribed = false; // Stop reconnect loops
                    eventSource.close();
                    eventSourceRef.current = null;
                    setStatus("disconnected");
                    if (options?.onStatusChange) {
                        options.onStatusChange("disconnected");
                    }
                });

                eventSource.onerror = (error) => {
                    if (!isSubscribed) return;

                    logger.error("[SSE] Connection error:", error);
                    eventSource.close();
                    eventSourceRef.current = null;

                    // Reconnect with exponential backoff
                    if (reconnectAttemptsRef.current < maxRetries) {
                        reconnectAttemptsRef.current++;
                        // Backoff: 2s, 4s, 8s, 16s, capped at 30s
                        const delay = Math.min(
                            baseRetryDelay *
                                2 ** (reconnectAttemptsRef.current - 1),
                            SSE_MAX_RETRY_DELAY,
                        );
                        logger.debug(
                            `[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxRetries})`,
                        );

                        setStatus("reconnecting");
                        if (options?.onStatusChange) {
                            options.onStatusChange("reconnecting");
                        }

                        reconnectTimeoutRef.current = setTimeout(() => {
                            if (isSubscribed) {
                                connect();
                            }
                        }, delay);
                    } else {
                        logger.error("[SSE] Max reconnection attempts reached");
                        setStatus("error");
                        if (options?.onStatusChange) {
                            options.onStatusChange("error");
                        }
                        if (options?.onError) {
                            options.onError(
                                new Error("Max reconnection attempts reached"),
                            );
                        }
                    }
                };
            } catch (error) {
                logger.error("[SSE] Failed to create EventSource:", error);
                setStatus("error");
                if (options?.onStatusChange) {
                    options.onStatusChange("error");
                }
                if (options?.onError) {
                    options.onError(error);
                }
            }
        };

        connect();

        // Teardown
        return () => {
            isSubscribed = false;
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            setStatus("disconnected");
        };
    }, [taskId, setTask, routeTaskToNode, maxRetries, baseRetryDelay, options]);

    // SSE connection status
    return { status };
}

// -------------------- Single-task creation hook --------------------

/**
 * Create a task and automatically attach SSE streaming.
 */
export function useCreateTask(options?: TaskSubscriptionOptions) {
    const { setTask, trackTaskToNode } = useTaskStore();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

    // Hydrate SSE after task id is known
    useTaskSubscription(createdTaskId ?? undefined, options);

    const createTask = useCallback(
        async (config: TaskCreationConfig): Promise<string> => {
            setIsLoading(true);
            setError(null);

            try {
                const { taskId } = await apiCreateTask(config);

                // Persisted id kicks off SSE subscription
                setCreatedTaskId(taskId);

                // Seed store immediately
                setTask(taskId, {
                    id: taskId,
                    status: "PENDING",
                    progress: 0,
                    data: config.prompt,
                    nodeId: config.nodeId, // Source node id
                });

                // Link task -> node for routing
                trackTaskToNode(taskId, config.nodeId);

                logger.debug(
                    `[useCreateTask] Task ${taskId} created from node ${config.nodeId}`,
                );

                return taskId;
            } catch (err) {
                const error =
                    err instanceof Error
                        ? err
                        : new Error("Failed to create task");
                setError(error);
                throw error;
            } finally {
                setIsLoading(false);
            }
        },
        [setTask, trackTaskToNode],
    );

    return { createTask, isLoading, error };
}

// -------------------- Batch task manager hook --------------------

/**
 * Manage many tasks concurrently.
 * Opens one SSE channel per task; loading stops when streams finish or drop.
 */
export function useBatchTaskManager(
    config?: BatchTaskConfig,
    options?: TaskSubscriptionOptions,
) {
    const t = useTranslations("Workspace.toast");
    const { setTask, trackTaskToNode, routeTaskToNode } = useTaskStore();
    const [isLoading, setIsLoading] = useState(false);
    const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
    const [totalTasks, setTotalTasks] = useState(0);
    const [currentBatchTaskIds, setCurrentBatchTaskIds] = useState<Set<string>>(
        new Set(),
    );
    const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
    const activeConnectionsRef = useRef<Set<string>>(new Set());
    /** Shared cancel fallback timeout between SSE handlers and cancelTasks */
    const batchCancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());
    const reconnectTimeoutsRef = useRef<
        Map<string, ReturnType<typeof setTimeout>>
    >(new Map());

    const createBatchTasks = useCallback(
        async (taskConfigs: TaskCreationConfig[]) => {
            // Flip loading immediately, before SSE connects
            setIsLoading(true);
            setCompletedTasks([]);
            setTotalTasks(taskConfigs.length);
            activeConnectionsRef.current.clear();
            if (batchCancelTimeoutRef.current != null) {
                clearTimeout(batchCancelTimeoutRef.current);
                batchCancelTimeoutRef.current = null;
            }

            try {
                const taskIds: string[] = [];

                const createPromises = taskConfigs.map(async (taskConfig) => {
                    const { taskId } = await apiCreateTask(taskConfig);
                    taskIds.push(taskId);

                    setTask(taskId, {
                        id: taskId,
                        status: "PENDING",
                        progress: 0,
                        data: taskConfig.prompt,
                        nodeId: taskConfig.nodeId,
                    });

                    // Link task -> node for routing
                    trackTaskToNode(taskId, taskConfig.nodeId);

                    // Per-task SSE (with backoff reconnect)
                    const connectTaskSSE = (tid: string) => {
                        const es = new EventSource(getTaskWaitUrl(tid));

                        es.onopen = () => {
                            logger.debug(
                                `[SSE Batch] Connected for task ${tid}`,
                            );
                            reconnectAttemptsRef.current.set(tid, 0);
                            activeConnectionsRef.current.add(tid);
                            emitSSEConnected(tid);
                        };

                        es.onmessage = (event) => {
                            try {
                                const message: SSETaskMessage = JSON.parse(
                                    event.data,
                                );
                                logger.debug(
                                    `[SSE Batch] Message for task ${tid}:`,
                                    message,
                                );

                                emitTaskProgressFromSSE(message);

                                const taskStatus = mapSSEStatusToTaskStatus(
                                    message.status,
                                );
                                const msgNodeId = message.nodeId;

                                const internalTask: Task = {
                                    id: message.id,
                                    status: taskStatus,
                                    progress: message.progress || 0,
                                    data: message.data,
                                    error: message.error,
                                    nodeId:
                                        (msgNodeId != null && msgNodeId !== ""
                                            ? String(msgNodeId)
                                            : undefined) ??
                                        useTaskStore
                                            .getState()
                                            .getTaskNodeId(message.id),
                                };

                                setTask(internalTask.id, internalTask);
                                routeTaskToNode(internalTask);

                                if (taskStatus === "COMPLETED") {
                                    toast.success(t("taskCompleted"));
                                } else if (taskStatus === "CANCELLED") {
                                    if (batchCancelTimeoutRef.current != null) {
                                        clearTimeout(
                                            batchCancelTimeoutRef.current,
                                        );
                                        batchCancelTimeoutRef.current = null;
                                    }
                                }

                                if (isTerminalStatus(message.status)) {
                                    updateTaskStatus({
                                        taskId: message.id,
                                        status: message.status,
                                        data: message.data,
                                    }).catch((err) => {
                                        logger.error(
                                            "[SSE Batch] Failed to update task status (frontend backup):",
                                            err,
                                        );
                                    });

                                    // Stop reconnect loop and close stream so
                                    // the server doesn't re-execute the task
                                    // on the next reconnect attempt.
                                    const pending =
                                        reconnectTimeoutsRef.current.get(tid);
                                    if (pending != null) {
                                        clearTimeout(pending);
                                        reconnectTimeoutsRef.current.delete(
                                            tid,
                                        );
                                    }
                                    reconnectAttemptsRef.current.set(
                                        tid,
                                        Number.POSITIVE_INFINITY,
                                    );
                                    es.close();
                                    eventSourcesRef.current.delete(tid);
                                    activeConnectionsRef.current.delete(tid);
                                    if (
                                        activeConnectionsRef.current.size === 0
                                    ) {
                                        setIsLoading(false);
                                        if (taskStatus === "CANCELLED") {
                                            setCurrentBatchTaskIds(new Set());
                                        }
                                    }
                                }

                                if (options?.onTaskUpdate) {
                                    options.onTaskUpdate(internalTask);
                                }
                            } catch (err) {
                                logger.error(
                                    `[SSE Batch] Error parsing message:`,
                                    err,
                                );
                            }
                        };

                        es.addEventListener("close", () => {
                            logger.debug(
                                `[SSE Batch] Server sent close event for task ${tid}`,
                            );
                            es.close();
                            eventSourcesRef.current.delete(tid);
                            activeConnectionsRef.current.delete(tid);
                            if (activeConnectionsRef.current.size === 0) {
                                setIsLoading(false);
                                logger.debug(
                                    "[SSE Batch] All connections closed, loading stopped",
                                );
                            }
                        });

                        es.onerror = () => {
                            es.close();
                            eventSourcesRef.current.delete(tid);

                            const attempts =
                                (reconnectAttemptsRef.current.get(tid) ?? 0) +
                                1;
                            if (attempts <= SSE_DEFAULT_MAX_RETRIES) {
                                reconnectAttemptsRef.current.set(tid, attempts);
                                const delay = Math.min(
                                    SSE_DEFAULT_RETRY_DELAY *
                                        2 ** (attempts - 1),
                                    SSE_MAX_RETRY_DELAY,
                                );
                                logger.debug(
                                    `[SSE Batch] Reconnecting task ${tid} in ${delay}ms (attempt ${attempts}/${SSE_DEFAULT_MAX_RETRIES})`,
                                );
                                const timeoutId = setTimeout(() => {
                                    reconnectTimeoutsRef.current.delete(tid);
                                    connectTaskSSE(tid);
                                }, delay);
                                reconnectTimeoutsRef.current.set(
                                    tid,
                                    timeoutId,
                                );
                            } else {
                                logger.error(
                                    `[SSE Batch] Max reconnection attempts reached for task ${tid}`,
                                );
                                activeConnectionsRef.current.delete(tid);
                                if (activeConnectionsRef.current.size === 0) {
                                    setIsLoading(false);
                                }
                                if (options?.onError) {
                                    options.onError(
                                        new Error(
                                            `Max reconnection attempts reached for task ${tid}`,
                                        ),
                                    );
                                }
                            }
                        };

                        eventSourcesRef.current.set(tid, es);
                    };

                    connectTaskSSE(taskId);

                    return taskId;
                });

                const createdTaskIds = await Promise.all(createPromises);
                setCurrentBatchTaskIds(new Set(createdTaskIds));

                return createdTaskIds;
            } catch (error) {
                logger.error("Failed to create batch tasks:", error);
                // Ensure loading clears if creation blows up
                setIsLoading(false);

                throw error;
            }
        },
        [setTask, trackTaskToNode, routeTaskToNode, options],
    );

    // Notify when entire batch settles
    useEffect(() => {
        if (currentBatchTaskIds.size === 0) return;

        const interval = setInterval(() => {
            const tasks = useTaskStore.getState().tasks;
            const batchTasks = Array.from(currentBatchTaskIds)
                .map((id) => tasks.get(id))
                .filter((task): task is Task => task !== undefined);

            const completed = batchTasks.filter(
                (task) =>
                    task.status === "COMPLETED" || task.status === "FAILED",
            );

            setCompletedTasks(completed);

            if (config?.onProgress) {
                config.onProgress(completed.length, totalTasks);
            }

            if (completed.length === totalTasks && config?.onBatchComplete) {
                config.onBatchComplete(completed);
                setCurrentBatchTaskIds(new Set());
            }
        }, 500);

        return () => clearInterval(interval);
    }, [currentBatchTaskIds, totalTasks, config]);

    // Cancel in-flight tasks
    const cancelTasks = useCallback(async () => {
        if (currentBatchTaskIds.size === 0) return;

        const taskIds = Array.from(currentBatchTaskIds);
        logger.debug("[BatchTaskManager] Cancelling tasks:", taskIds);

        // 1. Show cancelling state immediately
        for (const taskId of taskIds) {
            emitSSETaskMessage({
                id: taskId,
                status: TaskStatus.RUNNING,
                nodeId: null,
                data: { message: t("cancelling") },
            });
        }

        // 2. Hit backend stop endpoints
        const stopPromises = taskIds.map(async (taskId) => {
            try {
                const response = await fetch(getTaskStopUrl(), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ taskId }),
                });
                logger.debug(
                    `[BatchTaskManager] Stop request sent for task: ${taskId}`,
                );
                return response.ok;
            } catch (error) {
                logger.error(
                    `[BatchTaskManager] Failed to send stop request for task ${taskId}:`,
                    error,
                );
                return false;
            }
        });

        // Drain stop RPCs
        await Promise.all(stopPromises);

        if (batchCancelTimeoutRef.current != null) {
            clearTimeout(batchCancelTimeoutRef.current);
            batchCancelTimeoutRef.current = null;
        }

        // 3. Wait for backend CANCELLED or synthesize cancel after 10s
        const timeoutId = setTimeout(() => {
            batchCancelTimeoutRef.current = null;
            logger.debug(
                "[BatchTaskManager] Timeout waiting for CANCELLED message, emitting manually",
            );
            // Synthesize toast events if SSE is silent
            for (const taskId of taskIds) {
                emitSSETaskMessage({
                    id: taskId,
                    status: TaskStatus.CANCELLED,
                    nodeId: null,
                    data: { message: t("cancelled") },
                });
            }

            // Tear down SSE clients
            eventSourcesRef.current.forEach((eventSource) => {
                eventSource.close();
            });
            eventSourcesRef.current.clear();
            activeConnectionsRef.current.clear();

            // Reset manager state
            setIsLoading(false);
            setCurrentBatchTaskIds(new Set());
        }, 10000);

        batchCancelTimeoutRef.current = timeoutId;
    }, [currentBatchTaskIds, t]);

    // React to toast-driven cancel intents
    useEffect(() => {
        const handleCancelRequest = () => {
            // Only react while a batch owns tasks
            if (currentBatchTaskIds.size > 0) {
                logger.debug(
                    "[BatchTaskManager] Received cancel request from Toast",
                );
                cancelTasks();
            }
        };

        window.addEventListener(TASK_CANCEL_REQUEST_EVENT, handleCancelRequest);
        return () => {
            window.removeEventListener(
                TASK_CANCEL_REQUEST_EVENT,
                handleCancelRequest,
            );
        };
    }, [currentBatchTaskIds, cancelTasks]);

    // Tear down SSE registries on unmount
    useEffect(() => {
        return () => {
            if (batchCancelTimeoutRef.current != null) {
                clearTimeout(batchCancelTimeoutRef.current);
                batchCancelTimeoutRef.current = null;
            }
            eventSourcesRef.current.forEach((eventSource) => {
                eventSource.close();
            });
            eventSourcesRef.current.clear();
            activeConnectionsRef.current.clear();
            reconnectTimeoutsRef.current.forEach(clearTimeout);
            reconnectTimeoutsRef.current.clear();
            reconnectAttemptsRef.current.clear();
        };
    }, []);

    return {
        createBatchTasks,
        cancelTasks,
        isLoading,
        completedTasks,
        progress:
            totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0,
    };
}

// -------------------- Composition hook --------------------

/**
 * Convenience hook bridging the Zustand store with routing helpers.
 *
 * SSE handling is encapsulated by useCreateTask; consumers rarely subscribe manually.
 */
export function useTask() {
    const tasks = useTaskStore((state) => state.tasks);
    const setTask = useTaskStore((state) => state.setTask);
    const getTask = useTaskStore((state) => state.getTask);
    const removeTask = useTaskStore((state) => state.removeTask);
    const clearCompletedTasks = useTaskStore(
        (state) => state.clearCompletedTasks,
    );
    const getActiveTasks = useTaskStore((state) => state.getActiveTasks);
    const hasActiveTasks = useTaskStore((state) => state.hasActiveTasks);
    const trackTaskToNode = useTaskStore((state) => state.trackTaskToNode);
    const getTaskNodeId = useTaskStore((state) => state.getTaskNodeId);
    const registerNodeHandler = useTaskStore(
        (state) => state.registerNodeHandler,
    );
    const unregisterNodeHandler = useTaskStore(
        (state) => state.unregisterNodeHandler,
    );
    const routeTaskToNode = useTaskStore((state) => state.routeTaskToNode);

    return {
        tasks,
        setTask,
        getTask,
        removeTask,
        clearCompletedTasks,
        getActiveTasks,
        hasActiveTasks,
        // Node association helpers
        trackTaskToNode,
        getTaskNodeId,
        registerNodeHandler,
        unregisterNodeHandler,
        routeTaskToNode,
    };
}

// -------------------- Node-scoped subscriptions --------------------

/**
 * Subscribe handlers for updates emitted by tasks created from nodeId.
 */
export function useNodeTaskUpdate(nodeId: string, handler: NodeTaskHandler) {
    const { registerNodeHandler, unregisterNodeHandler } = useTaskStore();
    const handlerRef = useRef(handler);

    // Keep latest handler without re-register storm
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    useEffect(() => {
        if (!nodeId) return;

        // Stable wrapper referencing handlerRef.current
        const wrappedHandler: NodeTaskHandler = (task) => {
            handlerRef.current(task);
        };

        logger.debug(
            `[useNodeTaskUpdate] Registering task update handler for node: ${nodeId}`,
        );
        registerNodeHandler(nodeId, wrappedHandler);

        return () => {
            logger.debug(
                `[useNodeTaskUpdate] Unregistering task update handler for node: ${nodeId}`,
            );
            unregisterNodeHandler(nodeId, wrappedHandler);
        };
    }, [nodeId, registerNodeHandler, unregisterNodeHandler]);
}
