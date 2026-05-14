/**
 * Task API client
 */

import { apiGet, apiPost } from "./client";

export interface Task {
    id: string;
    nodeId: string;
    feature: string;
    prompt: Record<string, unknown>;
    status: "pending" | "processing" | "completed" | "failed" | "cancelled";
    progress: number;
    result?: unknown;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateTaskRequest {
    feature: string;
    pluginId: string;
    prompt: Record<string, unknown>;
    nodeId: string;
    workflowId?: number;
}

export interface CreateTaskResponse {
    taskId: string;
}

/**
 * Create task
 */
export async function createTask(
    config: CreateTaskRequest,
): Promise<CreateTaskResponse> {
    return await apiPost<CreateTaskResponse>("/api/task/create", config);
}

export interface ListTasksResponse {
    tasks: Task[];
}

/**
 * Get task list
 */
export async function listTasks(
    page = 1,
    pageSize = 20,
): Promise<ListTasksResponse> {
    return await apiGet<ListTasksResponse>(
        `/api/task/list?page=${page}&pageSize=${pageSize}`,
    );
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
 * Update task status (frontend safety net, for single tasks)
 * Do not save assets; only update task status
 */
export async function updateTaskStatus(
    request: UpdateStatusRequest,
): Promise<UpdateStatusResponse> {
    return await apiPost<UpdateStatusResponse>(
        "/api/task/update-status",
        request,
    );
}
