/**
 * Material API client — local library
 */

import { logger } from "@/lib/logger";
import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export type MaterialType =
    | "image"
    | "video"
    | "audio"
    | "text"
    | "file"
    | "model";

export interface Material {
    id: number;
    name: string;
    type: MaterialType;
    content: {
        fileKeys?: string[];
        texts?: string[];
    };
    thumbnail?: string;
    isFavorite: boolean;
    isCover?: boolean;
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

export async function createMaterial(
    data: CreateMaterialRequest,
): Promise<CreateMaterialResponse> {
    return await apiPost<CreateMaterialResponse>("/api/material", data);
}

export async function listMaterials(
    type?: MaterialType,
): Promise<ListMaterialsResponse> {
    const url = type ? `/api/material?type=${type}` : "/api/material";
    return await apiGet<ListMaterialsResponse>(url);
}

export async function deleteMaterial(id: number): Promise<void> {
    await apiDelete(`/api/material?id=${id}`);
}

export async function toggleFavorite(
    id: number,
): Promise<{ isFavorite: boolean }> {
    return await apiPatch<{ isFavorite: boolean }>(`/api/material?id=${id}`);
}

export interface TraceMaterialWorkflowResponse {
    workflow: {
        id: number;
        name: string;
        description?: string;
        cover?: string;
    } | null;
    message?: string;
}

export async function traceMaterialWorkflow(
    materialId: number,
): Promise<TraceMaterialWorkflowResponse> {
    return await apiGet<TraceMaterialWorkflowResponse>(
        `/api/material/${materialId}/workflow`,
    );
}

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

export async function saveFromTask(
    data: SaveFromTaskRequest,
): Promise<SaveFromTaskResponse> {
    try {
        return await apiPost<SaveFromTaskResponse>(
            "/api/material/save-from-task",
            data,
        );
    } catch (error) {
        logger.warn(
            "[Frontend] save-from-task failed (webhook backup exists):",
            error,
        );
        return { success: false, error: "Request failed" };
    }
}
