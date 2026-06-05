/**
 * Workspace API client — local workflows
 */

import type { ExecutableWorkflow } from "@/lib/workflow/executable-workflow";
import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { Material } from "./material";

export interface Workflow {
    id: number;
    name: string;
    description?: string;
    flow: string;
    executable?: string;
    cover?: string | null;
    createdAt: Date;
    updatedAt: Date;
    deleted: boolean;
}

export interface SaveWorkflowRequest {
    workflowId?: number;
    name: string;
    description?: string;
    flow: Record<string, unknown>;
    executable?: ExecutableWorkflow;
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

/**
 * Save workflow
 */
export async function saveWorkflow(
    data: SaveWorkflowRequest,
): Promise<SaveWorkflowResponse> {
    return await apiPost<SaveWorkflowResponse>("/api/workspace/save", data);
}

export async function listWorkflows(
    page = 1,
    limit = 10,
): Promise<ListWorkflowsResponse> {
    return await apiGet<ListWorkflowsResponse>(
        `/api/workspace/list?page=${page}&limit=${limit}`,
    );
}

export async function getWorkflow(id: number): Promise<GetWorkflowResponse> {
    return await apiGet<GetWorkflowResponse>(`/api/workspace/${id}`);
}

export async function deleteWorkflow(id: number): Promise<void> {
    await apiDelete(`/api/workspace/${id}`);
}

export async function updateWorkflow(
    id: number,
    data: Partial<SaveWorkflowRequest>,
): Promise<void> {
    await apiPut(`/api/workspace/${id}`, data);
}

export interface WorkflowMaterialsResponse {
    materials: Material[];
}

export async function getWorkflowMaterials(
    workflowId: number,
    type: string = "image",
): Promise<WorkflowMaterialsResponse> {
    return await apiGet<WorkflowMaterialsResponse>(
        `/api/workflow/${workflowId}/materials?type=${type}`,
    );
}
