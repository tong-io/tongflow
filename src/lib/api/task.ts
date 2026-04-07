/**
 * Task API 客户端
 */

import { apiPost, apiGet } from "@/utils/api-client";

export interface Task {
    id: string;
    userId: string;
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
    prompt: Record<string, unknown>;
    nodeId: string;
    workflowId?: number; // 执行自己的 workflow 时传入
    shareId?: number; // 执行别人的 share 时传入
}

export interface CreateTaskResponse {
    taskId: string;
}

/**
 * 创建任务
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
 * 获取任务列表
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
 * 更新任务状态（前端双保险，单任务用）
 * 不保存素材，仅更新任务状态
 */
export async function updateTaskStatus(
    request: UpdateStatusRequest,
): Promise<UpdateStatusResponse> {
    return await apiPost<UpdateStatusResponse>(
        "/api/task/update-status",
        request,
    );
}
