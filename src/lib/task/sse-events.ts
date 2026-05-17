"use client";

import { logger } from "@/lib/logger";
import type { SSEMessage } from "@/types/sse";

export const SSE_TASK_MESSAGE_EVENT = "sse-task-message";
export const TASK_CANCEL_REQUEST_EVENT = "task-cancel-request";

export interface TaskCancelRequestDetail {
    taskId: string | null;
}

export function emitSSETaskMessage(message: SSEMessage) {
    if (typeof window !== "undefined") {
        logger.debug("[emitSSETaskMessage] Emitting:", message);
        const event = new CustomEvent(SSE_TASK_MESSAGE_EVENT, {
            detail: message,
        });
        window.dispatchEvent(event);
    }
}

export function emitSSEConnected(taskId: string) {
    emitSSETaskMessage({
        id: taskId,
        status: "SSE_CONNECTED",
        nodeId: null,
    });
}

export function emitTaskCancelRequest(taskId: string | null) {
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent<TaskCancelRequestDetail>(
                TASK_CANCEL_REQUEST_EVENT,
                { detail: { taskId } },
            ),
        );
    }
}
