/**
 * Material API 客户端
 * 用于管理素材收藏
 */

import { apiPost, apiGet, apiDelete, apiPatch } from "@/utils/api-client";

export type MaterialType =
    | "image"
    | "video"
    | "audio"
    | "text"
    | "file"
    | "model";

export interface Material {
    id: number;
    userId: string;
    name: string;
    type: MaterialType;
    content: {
        fileKeys?: string[];
        texts?: string[];
    };
    thumbnail?: string;
    isFavorite: boolean;
    isShared: boolean;
    isCover?: boolean; // 是否被用作工作流代表作
    createdAt: Date;
    updatedAt: Date;
    deleted: boolean;
}

export interface CreateMaterialRequest {
    name: string;
    type: MaterialType;
    content: {
        fileKeys?: string[];
        texts?: string[];
    };
    thumbnail?: string;
}

export interface CreateMaterialResponse {
    materialId: number;
}

export interface ListMaterialsResponse {
    materials: Material[];
}

/**
 * 创建素材（收藏）
 */
export async function createMaterial(
    data: CreateMaterialRequest,
): Promise<CreateMaterialResponse> {
    return await apiPost<CreateMaterialResponse>("/api/material", data);
}

/**
 * 获取素材列表
 * @param type 可选，按类型筛选
 */
export async function listMaterials(
    type?: MaterialType,
): Promise<ListMaterialsResponse> {
    const url = type ? `/api/material?type=${type}` : "/api/material";
    return await apiGet<ListMaterialsResponse>(url);
}

/**
 * 删除素材
 */
export async function deleteMaterial(id: number): Promise<void> {
    await apiDelete(`/api/material?id=${id}`);
}

/**
 * 切换素材收藏状态
 */
export async function toggleFavorite(
    id: number,
): Promise<{ isFavorite: boolean }> {
    return await apiPatch<{ isFavorite: boolean }>(`/api/material?id=${id}`);
}

/**
 * 切换素材分享状态
 */
export async function toggleShare(id: number): Promise<{ isShared: boolean }> {
    return await apiPatch<{ isShared: boolean }>(`/api/material/${id}/share`);
}

// ============ 分享相关接口 ============

export interface TraceMaterialWorkflowResponse {
    workflow: {
        id: number;
        name: string;
        description?: string;
        cover?: string;
        currentShareId?: number;
        isPublished: boolean;
    } | null;
    share: {
        id: number;
        name: string;
        description: string;
        cover?: string;
        userId: string;
        workflowId?: number;
        version: number;
        isOwner: boolean;
    } | null;
    source?: "workflow" | "share";
    message?: string;
}

export interface ShareFromMaterialRequest {
    description: string;
}

export interface ShareFromMaterialResponse {
    shareId: number;
    version: number;
    isUpdate: boolean;
    cover: string;
}

/**
 * 从作品追溯关联的工作流
 */
export async function traceMaterialWorkflow(
    materialId: number,
): Promise<TraceMaterialWorkflowResponse> {
    return await apiGet<TraceMaterialWorkflowResponse>(
        `/api/material/${materialId}/workflow`,
    );
}

/**
 * 从作品分享工作流
 * - 自动追溯到关联的工作流
 * - 使用当前作品作为代表作
 */
export async function shareFromMaterial(
    materialId: number,
    data: ShareFromMaterialRequest,
): Promise<ShareFromMaterialResponse> {
    return await apiPost<ShareFromMaterialResponse>(
        `/api/material/${materialId}/share`,
        data,
    );
}

// ============ 前端双保险接口 ============

export interface SaveFromTaskRequest {
    taskId: string;
    status: string;
    data?: {
        file_key?: string;
        file_keys?: string[];
        text?: string;
        texts?: string[];
        feature?: string;
        outputs?: Record<string, unknown>;
        [key: string]: unknown;
    };
}

export interface SaveFromTaskResponse {
    success: boolean;
    taskUpdated?: boolean;
    savedMaterials?: number;
    skipped?: boolean;
    error?: string;
}

/**
 * 前端双保险：更新任务状态 + 保存素材
 * 当 SSE 收到任务终态消息时调用
 * 静默失败，不影响主流程（webhook 会兜底）
 */
export async function saveFromTask(
    data: SaveFromTaskRequest,
): Promise<SaveFromTaskResponse> {
    try {
        return await apiPost<SaveFromTaskResponse>(
            "/api/material/save-from-task",
            data,
        );
    } catch (error) {
        // 静默失败
        console.warn(
            "[Frontend] save-from-task failed (webhook backup exists):",
            error,
        );
        return { success: false, error: "Request failed" };
    }
}
