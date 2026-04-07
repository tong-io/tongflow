/**
 * 任务管理 Hook
 * 使用 SSE (Server-Sent Events) 进行实时任务更新
 */

import { create } from "zustand";
import { useState, useCallback, useEffect, useRef } from "react";
import { createTask as apiCreateTask, updateTaskStatus } from "@/lib/api/task";
import type { Task as ApiTask } from "@/lib/api/task";
import toast from "react-hot-toast";
import {
    type SSEStatusType,
    mapSSEStatusToTaskStatus,
    isTerminalStatus,
} from "@/constants/task-status";
import {
    emitSSETaskMessage,
    emitSSEConnected,
} from "@/components/workspace/task-progress-toast";
import { getTaskStopUrl, getTaskWaitUrl } from "@/lib/task-api-url";

// SSE 消息类型定义
interface SSETaskMessage {
    id: string;
    status: SSEStatusType;
    data?: Record<string, unknown>;
    progress?: number;
    error?: string;
}

// -------------------- 类型定义 --------------------

export interface Task {
    id: string;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
    data?: Record<string, unknown>;
    progress?: number;
    result?: unknown;
    error?: string;
    nodeId?: string; // 关联的节点ID
}

// 节点处理器映射：taskId -> nodeId -> 处理函数
export type NodeTaskHandler = (task: Task) => void;

// 工作区模式类型
export type WorkspaceMode = "create" | "execute";

// 工作流执行状态
export type WorkflowExecutionStatus =
    | "idle" // 空闲
    | "running" // 运行中
    | "paused" // 暂停
    | "completed" // 完成
    | "failed"; // 失败

export const WORKSPACE_MODE_KEY = "workspace-mode";

export interface TaskState {
    tasks: Map<string, Task>;
    // 工作区模式
    workspaceMode: WorkspaceMode;
    setWorkspaceMode: (mode: WorkspaceMode) => void;
    // 工作流执行状态
    workflowExecutionStatus: WorkflowExecutionStatus;
    setWorkflowExecutionStatus: (status: WorkflowExecutionStatus) => void;
    // 当前执行的层级
    currentExecutionLevel: number;
    setCurrentExecutionLevel: (level: number) => void;
    // 节点执行状态映射
    nodeExecutionStatusMap: Map<string, string>; // nodeId -> status
    setNodeExecutionStatus: (nodeId: string, status: string) => void;
    clearNodeExecutionStatus: () => void;
    // 节点任务映射：trackTaskToNode(taskId, nodeId) 记录任务来自哪个节点
    taskNodeMap: Map<string, string>; // taskId -> nodeId
    // 节点处理器：registerNodeHandler(nodeId, handler) 注册节点的处理函数
    nodeHandlers: Map<string, NodeTaskHandler[]>; // nodeId -> handlers[]
    setTask: (taskId: string | number, task: Task) => void;
    getTask: (taskId: string | number) => Task | undefined;
    removeTask: (taskId: string | number) => void;
    clearCompletedTasks: () => void;
    getActiveTasks: () => Task[];
    hasActiveTasks: () => boolean;
    // 新增方法：记录任务与节点的关联
    trackTaskToNode: (taskId: string, nodeId: string) => void;
    // 新增方法：获取任务关联的节点ID
    getTaskNodeId: (taskId: string) => string | undefined;
    // 新增方法：注册节点处理器
    registerNodeHandler: (nodeId: string, handler: NodeTaskHandler) => void;
    // 新增方法：注销节点处理器
    unregisterNodeHandler: (nodeId: string, handler: NodeTaskHandler) => void;
    // 新增方法：分发任务更新给对应节点
    routeTaskToNode: (task: Task) => void;
}

// 任务创建配置
export interface TaskCreationConfig {
    feature: string;
    prompt: Record<string, unknown>;
    nodeId: string;
    workflowId?: number; // 执行自己的 workflow 时传入
    shareId?: number; // 执行别人的 share 时传入
}

// 批量任务配置
export interface BatchTaskConfig {
    onBatchComplete?: (tasks: Task[]) => void;
    onProgress?: (completed: number, total: number) => void;
}

// 订阅配置选项
export interface TaskSubscriptionOptions {
    onError?: (error: unknown) => void;
    maxRetries?: number;
    retryDelay?: number;
    onTaskUpdate?: (task: Task) => void;
    // 连接状态变化回调：connecting | connected | reconnecting | disconnected | error
    onStatusChange?: (
        status:
            | "connecting"
            | "connected"
            | "reconnecting"
            | "disconnected"
            | "error",
    ) => void;
}

// SSE 连接默认配置
const SSE_DEFAULT_MAX_RETRIES = 10; // 增加到10次重试
const SSE_DEFAULT_RETRY_DELAY = 2000; // 2秒起始延迟
const SSE_MAX_RETRY_DELAY = 30000; // 最大30秒延迟

// -------------------- Zustand Store --------------------

export const useTaskStore = create<TaskState>((set, get) => ({
    tasks: new Map(),
    taskNodeMap: new Map(), // taskId -> nodeId 映射
    nodeHandlers: new Map(), // nodeId -> handlers 映射
    // 工作区模式，初始化为 "create" 以避免 SSR hydration 不匹配
    // 客户端 hydration 后会通过 useEffect 从 localStorage 恢复
    workspaceMode: "create" as WorkspaceMode,

    // 工作流执行状态
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

            // 同时移除任务-节点映射
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
                    // 移除已完成任务的节点映射
                    newTaskNodeMap.delete(taskId);
                }
            }
            console.log(
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

    // 记录任务与节点的关联
    trackTaskToNode: (taskId, nodeId) => {
        set((state) => {
            const newTaskNodeMap = new Map(state.taskNodeMap);
            newTaskNodeMap.set(taskId, nodeId);
            console.log(
                `[Task Store] Task ${taskId} tracked to node ${nodeId}`,
            );
            return { taskNodeMap: newTaskNodeMap };
        });
    },

    // 获取任务关联的节点ID
    getTaskNodeId: (taskId) => get().taskNodeMap.get(taskId),

    // 注册节点处理器
    registerNodeHandler: (nodeId, handler) => {
        set((state) => {
            const newNodeHandlers = new Map(state.nodeHandlers);
            const handlers = newNodeHandlers.get(nodeId) || [];
            handlers.push(handler);
            newNodeHandlers.set(nodeId, handlers);
            console.log(
                `[Task Store] Registered handler for node ${nodeId}, total handlers: ${handlers.length}`,
            );
            return { nodeHandlers: newNodeHandlers };
        });
    },

    // 注销节点处理器
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
            console.log(
                `[Task Store] Unregistered handler for node ${nodeId}, remaining handlers: ${handlers.length}`,
            );
            return { nodeHandlers: newNodeHandlers };
        });
    },

    // 分发任务更新给对应节点
    routeTaskToNode: (task) => {
        const state = get();
        const nodeId =
            state.taskNodeMap.get(task.id) ??
            (task.nodeId ? String(task.nodeId) : undefined);

        if (nodeId) {
            const handlers = state.nodeHandlers.get(nodeId) || [];
            console.log(
                `[Task Router] Routing task ${task.id} (status: ${task.status}) to node ${nodeId}, handlers: ${handlers.length}`,
            );

            handlers.forEach((handler) => {
                try {
                    handler(task);
                } catch (error) {
                    console.error(
                        `[Task Router] Error calling handler for node ${nodeId}:`,
                        error,
                    );
                }
            });
        } else {
            console.warn(
                `[Task Router] No node found for task ${task.id}, storing in global store only`,
            );
        }
    },
}));

// -------------------- Realtime 订阅 Hook --------------------

/**
 * 订阅任务更新（使用 SSE - Server-Sent Events）
 * 自动处理：
 * - 连接管理
 * - 自动重连
 * - 消息解析
 */
export function useTaskSubscription(
    taskId?: string,
    options?: TaskSubscriptionOptions,
) {
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

                // 创建 SSE 连接
                const eventSource = new EventSource(getTaskWaitUrl(taskId));
                eventSourceRef.current = eventSource;

                eventSource.onopen = () => {
                    if (!isSubscribed) return;
                    setStatus("connected");
                    reconnectAttemptsRef.current = 0;
                    // 触发 SSE 连接建立事件
                    emitSSEConnected(taskId);
                    if (options?.onStatusChange) {
                        options.onStatusChange("connected");
                    }
                };

                eventSource.onmessage = (event) => {
                    if (!isSubscribed) return;

                    try {
                        const message: SSETaskMessage = JSON.parse(event.data);
                        console.log(`[SSE] Received message:`, message);

                        // 触发 SSE 消息事件，用于 TaskProgressToast
                        emitSSETaskMessage({
                            id: message.id,
                            status: message.status as any,
                            nodeId: (message as any).nodeId || null,
                            data: message.data as any,
                        });

                        // 使用统一的状态映射函数
                        const taskStatus = mapSSEStatusToTaskStatus(
                            message.status,
                        );

                        const msg = message as SSETaskMessage & {
                            nodeId?: string | null;
                        };
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
                                (msg.nodeId != null && msg.nodeId !== ""
                                    ? String(msg.nodeId)
                                    : undefined) ??
                                useTaskStore
                                    .getState()
                                    .getTaskNodeId(message.id),
                        };

                        // 更新全局任务存储
                        setTask(internalTask.id, internalTask);
                        console.log(
                            `[SSE] Task updated: ${internalTask.id} (${internalTask.status})`,
                        );

                        // 任务结束时弹出 toast 提示
                        if (taskStatus === "COMPLETED") {
                            toast.success(`任务完成`);
                        } else if (taskStatus === "FAILED") {
                            const errorMsg =
                                internalTask.error ||
                                (message.data as Record<string, unknown>)
                                    ?.error;
                            toast.error(
                                `任务失败${errorMsg ? `：${errorMsg}` : ""}`,
                            );
                        }

                        // 单任务终态时，调用前端双保险更新任务状态（不保存素材）
                        if (isTerminalStatus(message.status)) {
                            updateTaskStatus({
                                taskId: message.id,
                                status: message.status,
                                data: message.data,
                            }).catch((error) => {
                                console.error(
                                    "[SSE] Failed to update task status (frontend backup):",
                                    error,
                                );
                            });
                        }

                        // 路由任务到对应的节点
                        routeTaskToNode(internalTask);

                        // 通知全局回调
                        if (options?.onTaskUpdate) {
                            options.onTaskUpdate(internalTask);
                        }
                    } catch (error) {
                        console.error(
                            "[SSE] Error parsing message:",
                            error,
                            event.data,
                        );
                    }
                };

                // 监听后端发送的 close 事件（自定义事件）
                eventSource.addEventListener("close", () => {
                    console.log("[SSE] Server sent close event");
                    if (!isSubscribed) return;
                    isSubscribed = false; // 阻止重连
                    eventSource.close();
                    eventSourceRef.current = null;
                    setStatus("disconnected");
                    if (options?.onStatusChange) {
                        options.onStatusChange("disconnected");
                    }
                });

                eventSource.onerror = (error) => {
                    if (!isSubscribed) return;

                    console.error("[SSE] Connection error:", error);
                    eventSource.close();
                    eventSourceRef.current = null;

                    // 尝试重连（指数退避）
                    if (reconnectAttemptsRef.current < maxRetries) {
                        reconnectAttemptsRef.current++;
                        // 指数退避: 2s, 4s, 8s, 16s, 最大30s
                        const delay = Math.min(
                            baseRetryDelay *
                                Math.pow(2, reconnectAttemptsRef.current - 1),
                            SSE_MAX_RETRY_DELAY,
                        );
                        console.log(
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
                        console.error(
                            "[SSE] Max reconnection attempts reached",
                        );
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
                console.error("[SSE] Failed to create EventSource:", error);
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

        // 清理函数
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

    // 返回连接状态
    return { status };
}

// -------------------- 任务创建 Hook --------------------

/**
 * 创建单个任务并自动建立 SSE 连接
 */
export function useCreateTask(options?: TaskSubscriptionOptions) {
    const { setTask, trackTaskToNode } = useTaskStore();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

    // 当 taskId 更新时，自动建立 SSE 连接
    useTaskSubscription(createdTaskId ?? undefined, options);

    const createTask = useCallback(
        async (config: TaskCreationConfig): Promise<string> => {
            setIsLoading(true);
            setError(null);

            try {
                const { taskId } = await apiCreateTask(config);

                // 保存 taskId，会触发 SSE 连接
                setCreatedTaskId(taskId);

                // 立即添加到 store
                setTask(taskId, {
                    id: taskId,
                    status: "PENDING",
                    progress: 0,
                    data: config.prompt,
                    nodeId: config.nodeId, // 记录来源节点
                });

                // 记录任务与节点的关联关系
                trackTaskToNode(taskId, config.nodeId);

                console.log(
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

// -------------------- 批量任务管理 Hook --------------------

/**
 * 批量任务管理 Hook
 * 为每个任务建立独立的 SSE 连接
 * loading 状态在 SSE 连接断开时自动结束
 */
export function useBatchTaskManager(
    config?: BatchTaskConfig,
    options?: TaskSubscriptionOptions,
) {
    const { setTask, trackTaskToNode, routeTaskToNode } = useTaskStore();
    const [isLoading, setIsLoading] = useState(false);
    const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
    const [totalTasks, setTotalTasks] = useState(0);
    const [currentBatchTaskIds, setCurrentBatchTaskIds] = useState<Set<string>>(
        new Set(),
    );
    const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
    const activeConnectionsRef = useRef<Set<string>>(new Set()); // 跟踪活跃的 SSE 连接

    const createBatchTasks = useCallback(
        async (taskConfigs: TaskCreationConfig[]) => {
            // 立即设置 loading 状态，不等待 API 返回或 SSE 连接
            setIsLoading(true);
            setCompletedTasks([]);
            setTotalTasks(taskConfigs.length);
            activeConnectionsRef.current.clear();

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

                    // 记录任务与节点的关联关系
                    trackTaskToNode(taskId, taskConfig.nodeId);

                    // 为每个任务建立 SSE 连接
                    const eventSource = new EventSource(getTaskWaitUrl(taskId));

                    eventSource.onopen = () => {
                        console.log(`[SSE Batch] Connected for task ${taskId}`);
                        // 标记连接为活跃
                        activeConnectionsRef.current.add(taskId);
                        // 触发 SSE 连接建立事件
                        emitSSEConnected(taskId);
                    };

                    eventSource.onmessage = (event) => {
                        try {
                            const message: SSETaskMessage = JSON.parse(
                                event.data,
                            );
                            console.log(
                                `[SSE Batch] Message for task ${taskId}:`,
                                message,
                            );

                            // 触发 SSE 消息事件，用于 TaskProgressToast
                            emitSSETaskMessage({
                                id: message.id,
                                status: message.status as any,
                                nodeId: (message as any).nodeId || null,
                                data: message.data as any,
                            });

                            // 使用统一的状态映射函数
                            const taskStatus = mapSSEStatusToTaskStatus(
                                message.status,
                            );

                            const msg = message as SSETaskMessage & {
                                nodeId?: string | null;
                            };
                            const internalTask: Task = {
                                id: message.id,
                                status: taskStatus,
                                progress: message.progress || 0,
                                data: message.data,
                                error: message.error,
                                nodeId:
                                    (msg.nodeId != null && msg.nodeId !== ""
                                        ? String(msg.nodeId)
                                        : undefined) ??
                                    useTaskStore
                                        .getState()
                                        .getTaskNodeId(message.id),
                            };

                            // 更新任务状态
                            setTask(internalTask.id, internalTask);
                            routeTaskToNode(internalTask);

                            // 任务结束时弹出 toast 提示
                            if (taskStatus === "COMPLETED") {
                                toast.success(`任务完成`);
                            } else if (taskStatus === "FAILED") {
                                toast.error(
                                    `任务失败${message.error ? `：${message.error}` : ""}`,
                                );
                            } else if (taskStatus === "CANCELLED") {
                                // 收到 CANCELLED 消息，清除超时定时器
                                if ((window as any).__batchCancelTimeoutId) {
                                    clearTimeout(
                                        (window as any).__batchCancelTimeoutId,
                                    );
                                    (window as any).__batchCancelTimeoutId =
                                        null;
                                }
                                // 关闭 SSE 连接
                                eventSource.close();
                                eventSourcesRef.current.delete(taskId);
                                activeConnectionsRef.current.delete(taskId);
                                // 检查是否所有连接都已关闭
                                if (activeConnectionsRef.current.size === 0) {
                                    setIsLoading(false);
                                    setCurrentBatchTaskIds(new Set());
                                }
                            }

                            // 单任务终态时，调用前端双保险更新任务状态（不保存素材）
                            if (isTerminalStatus(message.status)) {
                                updateTaskStatus({
                                    taskId: message.id,
                                    status: message.status,
                                    data: message.data,
                                }).catch((error) => {
                                    console.error(
                                        "[SSE Batch] Failed to update task status (frontend backup):",
                                        error,
                                    );
                                });
                            }

                            if (options?.onTaskUpdate) {
                                options.onTaskUpdate(internalTask);
                            }
                        } catch (error) {
                            console.error(
                                `[SSE Batch] Error parsing message:`,
                                error,
                            );
                        }
                    };

                    // 监听后端发送的 close 事件（自定义事件）
                    eventSource.addEventListener("close", () => {
                        console.log(
                            `[SSE Batch] Server sent close event for task ${taskId}`,
                        );
                        eventSource.close();
                        eventSourcesRef.current.delete(taskId);
                        activeConnectionsRef.current.delete(taskId);
                        // 检查是否所有连接都已关闭
                        if (activeConnectionsRef.current.size === 0) {
                            setIsLoading(false);
                            console.log(
                                "[SSE Batch] All connections closed, loading stopped",
                            );
                        }
                    });

                    eventSource.onerror = (error) => {
                        console.error(
                            `[SSE Batch] Connection error for task ${taskId}:`,
                            error,
                        );
                        // 关闭连接
                        eventSource.close();
                        eventSourcesRef.current.delete(taskId);
                        // 错误时也要移除活跃连接标记，并检查是否需要结束 loading
                        activeConnectionsRef.current.delete(taskId);
                        if (activeConnectionsRef.current.size === 0) {
                            setIsLoading(false);
                            console.log(
                                "[SSE Batch] All connections closed due to error, loading stopped",
                            );
                        }
                        if (options?.onError) {
                            options.onError(error);
                        }
                    };

                    eventSourcesRef.current.set(taskId, eventSource);

                    return taskId;
                });

                const createdTaskIds = await Promise.all(createPromises);
                setCurrentBatchTaskIds(new Set(createdTaskIds));

                return createdTaskIds;
            } catch (error) {
                console.error("Failed to create batch tasks:", error);
                // 如果创建失败，确保也结束 loading
                setIsLoading(false);

                throw error;
            }
        },
        [setTask, trackTaskToNode, routeTaskToNode, options],
    );

    // 监听批量任务完成
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

    // 取消任务
    const cancelTasks = useCallback(async () => {
        if (currentBatchTaskIds.size === 0) return;

        const taskIds = Array.from(currentBatchTaskIds);
        console.log("[BatchTaskManager] Cancelling tasks:", taskIds);

        // 1. 立即显示"取消中"状态
        for (const taskId of taskIds) {
            emitSSETaskMessage({
                id: taskId,
                status: "RUNNING" as any,
                nodeId: null,
                data: { message: "取消中..." },
            });
        }

        // 2. 调用后端停止接口
        const stopPromises = taskIds.map(async (taskId) => {
            try {
                const response = await fetch(getTaskStopUrl(), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ taskId }),
                });
                console.log(
                    `[BatchTaskManager] Stop request sent for task: ${taskId}`,
                );
                return response.ok;
            } catch (error) {
                console.error(
                    `[BatchTaskManager] Failed to send stop request for task ${taskId}:`,
                    error,
                );
                return false;
            }
        });

        // 等待所有停止请求完成
        await Promise.all(stopPromises);

        // 3. 设置超时，等待后端 CANCELLED 消息或 10 秒后手动触发
        const timeoutId = setTimeout(() => {
            console.log(
                "[BatchTaskManager] Timeout waiting for CANCELLED message, emitting manually",
            );
            // 手动触发取消事件到 Toast
            for (const taskId of taskIds) {
                emitSSETaskMessage({
                    id: taskId,
                    status: "CANCELLED" as any,
                    nodeId: null,
                    data: { message: "任务已取消" },
                });
            }

            // 关闭 SSE 连接
            eventSourcesRef.current.forEach((eventSource) => {
                eventSource.close();
            });
            eventSourcesRef.current.clear();
            activeConnectionsRef.current.clear();

            // 重置状态
            setIsLoading(false);
            setCurrentBatchTaskIds(new Set());
        }, 10000);

        // 存储 timeoutId 以便在收到 CANCELLED 消息时清除
        (window as any).__batchCancelTimeoutId = timeoutId;
    }, [currentBatchTaskIds]);

    // 监听取消请求事件（来自 TaskProgressToast）
    useEffect(() => {
        const handleCancelRequest = () => {
            // 只在有批量任务运行时才处理
            if (currentBatchTaskIds.size > 0) {
                console.log(
                    "[BatchTaskManager] Received cancel request from Toast",
                );
                cancelTasks();
            }
        };

        window.addEventListener("task-cancel-request", handleCancelRequest);
        return () => {
            window.removeEventListener(
                "task-cancel-request",
                handleCancelRequest,
            );
        };
    }, [currentBatchTaskIds, cancelTasks]);

    // 清理 EventSource 连接
    useEffect(() => {
        return () => {
            eventSourcesRef.current.forEach((eventSource) => {
                eventSource.close();
            });
            eventSourcesRef.current.clear();
            activeConnectionsRef.current.clear();
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

// -------------------- 主 Hook（组合订阅和存储） --------------------

/**
 * 主任务管理 Hook
 * 提供任务状态管理和节点路由功能
 *
 * 注意：SSE 连接由 useCreateTask 自动管理，无需手动订阅
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
        // 节点管理方法
        trackTaskToNode,
        getTaskNodeId,
        registerNodeHandler,
        unregisterNodeHandler,
        routeTaskToNode,
    };
}

// -------------------- 节点任务订阅 Hook --------------------

/**
 * 订阅特定节点的任务更新
 * 当某个节点创建的任务有更新时，会自动调用注册的处理函数
 */
export function useNodeTaskUpdate(nodeId: string, handler: NodeTaskHandler) {
    const { registerNodeHandler, unregisterNodeHandler } = useTaskStore();
    const handlerRef = useRef(handler);

    // 保持 handler 最新
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    useEffect(() => {
        if (!nodeId) return;

        // 创建包装的处理函数，确保使用最新的 handler
        const wrappedHandler: NodeTaskHandler = (task) => {
            handlerRef.current(task);
        };

        console.log(
            `[useNodeTaskUpdate] Registering task update handler for node: ${nodeId}`,
        );
        registerNodeHandler(nodeId, wrappedHandler);

        return () => {
            console.log(
                `[useNodeTaskUpdate] Unregistering task update handler for node: ${nodeId}`,
            );
            unregisterNodeHandler(nodeId, wrappedHandler);
        };
    }, [nodeId, registerNodeHandler, unregisterNodeHandler]);
}
