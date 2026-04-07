/**
 * Workspace API 客户端
 * 用于管理工作流
 */

import { apiPost, apiGet, apiDelete, apiPut } from "@/utils/api-client";
import type { Material } from "./material";

export interface Workflow {
    id: number;
    userId: string;
    name: string;
    description?: string;
    flow: string; // JSON string
    executable?: string; // 可执行工作流 JSON string
    cover?: string | null; // 代表作图片 URL，来自最新生成的 material
    currentShareId?: number | null; // 当前发布的 Share ID
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    deleted: boolean;
}

export interface SaveWorkflowRequest {
    workflowId?: number; // 已保存的工作流传入 ID 进行更新
    name: string;
    description?: string;
    flow: Record<string, unknown>;
    executable?: Record<string, unknown>;
    isPublic?: boolean;
}

export interface SaveWorkflowResponse {
    workflowId: number;
}

export interface ListWorkflowsResponse {
    workflows: Workflow[];
    pagination?: {
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
    };
}

export interface GetWorkflowResponse {
    workflow: Workflow;
}

export interface ShareWorkflowRequest {
    name: string;
    description: string;
    flow: Record<string, unknown>;
    execute: Record<string, unknown>;
}

export interface ShareWorkflowResponse {
    shareId: number;
}

/**
 * 保存工作流
 */
export async function saveWorkflow(
    data: SaveWorkflowRequest,
): Promise<SaveWorkflowResponse> {
    return await apiPost<SaveWorkflowResponse>("/api/workspace/save", data);
}

/**
 * 获取工作流列表（支持分页）
 */
export async function listWorkflows(
    page = 1,
    limit = 10,
): Promise<ListWorkflowsResponse> {
    return await apiGet<ListWorkflowsResponse>(
        `/api/workspace/list?page=${page}&limit=${limit}`,
    );
}

/**
 * 获取单个工作流
 */
export async function getWorkflow(id: number): Promise<GetWorkflowResponse> {
    return await apiGet<GetWorkflowResponse>(`/api/workspace/${id}`);
}

/**
 * 删除工作流（软删除）
 */
export async function deleteWorkflow(id: number): Promise<void> {
    await apiDelete(`/api/workspace/${id}`);
}

/**
 * 更新工作流
 */
export async function updateWorkflow(
    id: number,
    data: Partial<SaveWorkflowRequest>,
): Promise<void> {
    await apiPut(`/api/workspace/${id}`, data);
}

/**
 * 分享工作流到 shares 表
 */
export async function shareWorkflow(
    data: ShareWorkflowRequest,
): Promise<ShareWorkflowResponse> {
    return await apiPost<ShareWorkflowResponse>("/api/share/create", data);
}

// ============ 发布相关接口 ============

export interface PublishWorkflowRequest {
    workflowId: number;
    description: string;
    cover?: string; // 可选，默认使用 workflow.cover（最新执行结果）
}

export interface PublishWorkflowResponse {
    shareId: number;
    version: number;
    isUpdate: boolean;
    noChanges?: boolean;
}

export interface WorkflowMaterialsResponse {
    materials: Material[];
}

/**
 * 发布工作流
 * - 如果工作流已发布过，则更新（覆盖）
 * - 如果未发布过，则创建新的 Share
 */
export async function publishWorkflow(
    data: PublishWorkflowRequest,
): Promise<PublishWorkflowResponse> {
    return await apiPost<PublishWorkflowResponse>(
        "/api/workflow/publish",
        data,
    );
}

/**
 * 获取工作流产出的素材列表（用于选择代表作）
 */
export async function getWorkflowMaterials(
    workflowId: number,
    type: string = "image",
): Promise<WorkflowMaterialsResponse> {
    return await apiGet<WorkflowMaterialsResponse>(
        `/api/workflow/${workflowId}/materials?type=${type}`,
    );
}
