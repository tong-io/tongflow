/**
 * Task API client
 */

import type {
    CreateTaskRequest,
    CreateTaskResponse,
    UpdateStatusRequest,
    UpdateStatusResponse,
} from "../task/transport-types";
import { apiGet, apiPost } from "./client";

export type {
    CreateTaskRequest,
    CreateTaskResponse,
    UpdateStatusRequest,
    UpdateStatusResponse,
};

/** A persisted task row as returned by the task list API. */
export interface TaskRecord {
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

/**
 * Create task
 */
export async function createTask(
    config: CreateTaskRequest,
): Promise<CreateTaskResponse> {
    return await apiPost<CreateTaskResponse>("/api/task/create", config);
}

export interface ListTasksResponse {
    tasks: TaskRecord[];
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
