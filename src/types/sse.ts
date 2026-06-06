/**
 * SSE (Server-Sent Events) message shapes shared by workflow execution and progress UI.
 *
 * Centralized here so consumers (`execution-status-line`, `use-workflow-execution`, `use-workflow-recovery`)
 * stop relying on locally-typed JSON.parse results, which previously required `as any` casts.
 */

import type {
    NodeStatusType,
    TaskStatusType,
    WorkflowStatusType,
} from "@/constants/task-status";

export interface SSENodeInfo {
    id: string;
    label: string;
    feature: string;
}

/**
 * Union of all status strings that can appear in an SSE message.
 * Reuses the canonical enums from `task-status.ts`.
 * The extra string literals (`"NODE_PROGRESS"`) are statuses streamed by the
 * backend that aren't part of the lifecycle enums.
 */
export type SSEStatus =
    | TaskStatusType
    | WorkflowStatusType
    | NodeStatusType
    | "NODE_PROGRESS"
    /** Frontend-only synthetic event emitted when the EventSource opens */
    | "SSE_CONNECTED";

/**
 * Data payload accompanying an SSE message.
 * All fields are optional — actual presence depends on `status`.
 */
export interface SSEMessageData {
    totalNodes?: number;
    levels?: number;
    nodes?: SSENodeInfo[];
    level?: number;
    feature?: string;
    label?: string;
    output?: {
        fileKeys?: string[];
        texts?: string[];
    } & Record<string, unknown>;
    outputs?: Record<string, unknown>;
    duration?: number;
    totalDuration?: number;
    progress?: number;
    message?: string;
    code?: number;
    error?: string;
    status?: string;
    file_key?: string;
    file_keys?: string[];
    text?: string;
    texts?: string[];
    /** Open-ended: backend payloads may include arbitrary extra fields. */
    [key: string]: unknown;
}

/**
 * Full SSE message envelope.
 * `nodeId` is null for workflow-level events, set for node-level events.
 */
export interface SSEMessage {
    id: string;
    status: SSEStatus;
    nodeId: string | null;
    data?: SSEMessageData;
}
