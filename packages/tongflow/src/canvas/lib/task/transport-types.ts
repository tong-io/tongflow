/**
 * The single-node task transport contract between the canvas and a host
 * (types only, framework free: no React, no stores), so an engine adapter
 * can implement it without importing the canvas. `transport.ts` re-exports
 * it next to the default HTTP implementation; `../api/task.ts` re-exports
 * the request / response shapes.
 */

import type { SSEStatusType } from "../../../core/constants/task-status";

export interface CreateTaskRequest {
    feature: string;
    pluginId: string;
    /** Selected model for router-style plugins; omitted otherwise. */
    model?: string;
    /** Advanced parameters (plugin's `TONGFLOW_SLOT_PARAMS` keys); omitted
     * when the node runs on plugin defaults. */
    params?: Record<string, unknown>;
    prompt: Record<string, unknown>;
    nodeId: string;
    workflowId?: number;
}

export interface CreateTaskResponse {
    taskId: string;
}

export interface UpdateStatusRequest {
    taskId: string;
    status: string;
    data?: Record<string, unknown>;
}

export interface UpdateStatusResponse {
    success: boolean;
    taskUpdated?: boolean;
    skipped?: boolean;
}

/**
 * One task update, the shape of each `/api/task/wait` SSE message. A
 * terminal `status` (`COMPLETED` / `FAILED` / `CANCELLED` …) ends the task;
 * on `COMPLETED`, `data` is the plugin output the canvas routes into
 * downstream data nodes.
 */
export interface TaskWaitMessage {
    id: string;
    status: SSEStatusType;
    data?: Record<string, unknown>;
    progress?: number;
    error?: string;
    /** Optional field from backend (e.g. workflow NODE_* metadata) */
    nodeId?: string | null;
}

/**
 * Callbacks a transport drives while the canvas waits on a task. They mirror
 * `EventSource`: `onOpen` once the stream is live, `onMessage` per update,
 * `onClose` when the producer ends the stream on purpose, `onError` when the
 * stream drops (the canvas then reconnects with backoff by calling
 * `waitTask` again).
 */
export interface TaskWaitHandlers {
    onOpen: () => void;
    onMessage: (message: TaskWaitMessage) => void;
    onClose: () => void;
    onError: (error: unknown) => void;
}

/** A live wait; `close()` stops delivery and releases the stream. */
export interface TaskWaitConnection {
    close: () => void;
}

export interface CanvasTaskTransport {
    /** Create (and start) one task. */
    createTask: (request: CreateTaskRequest) => Promise<CreateTaskResponse>;
    /** Stream a task's updates until a terminal status or `close()`. */
    waitTask: (
        taskId: string,
        handlers: TaskWaitHandlers,
    ) => TaskWaitConnection;
    /** Ask the task to stop; resolves `true` when the request was accepted. */
    stopTask: (taskId: string) => Promise<boolean>;
    /** Report a terminal status the canvas observed (a persistence backstop). */
    updateTaskStatus: (
        request: UpdateStatusRequest,
    ) => Promise<UpdateStatusResponse>;
}
