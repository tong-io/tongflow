/**
 * Share API 客户端
 * 用于管理工作流分享
 */

import { apiPost, apiGet } from "@/utils/api-client";

export interface Share {
    id: number;
    userId: string;
    name: string;
    description: string;
    flow: string; // JSON string
    execute: string; // JSON string
    version: number;
    createdAt: Date;
    updatedAt: Date;
    deleted: boolean;
}

export interface CreateShareRequest {
    name: string;
    description: string;
    flow: Record<string, unknown>;
    execute: Record<string, unknown>;
}

export interface CreateShareResponse {
    shareId: number;
}

export interface ListSharesResponse {
    shares: Share[];
}

/**
 * 创建分享
 */
export async function createShare(
    data: CreateShareRequest,
): Promise<CreateShareResponse> {
    return await apiPost<CreateShareResponse>("/api/share/create", data);
}

/**
 * 获取分享列表
 */
export async function listShares(): Promise<ListSharesResponse> {
    return await apiGet<ListSharesResponse>("/api/share/list");
}

/**
 * 获取我的分享列表
 */
export async function listMyShares(): Promise<ListSharesResponse> {
    return await apiGet<ListSharesResponse>("/api/share/list?mine=true");
}
