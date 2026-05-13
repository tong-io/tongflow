/**
 * Global task event system
 *
 * Replaces Redis pub/sub with in-process EventEmitter realtime notifications.
 * SSE endpoints listen for events, and handlers publish events.
 */

import { EventEmitter } from "node:events";
import type { SSEStatusType } from "@/constants/task-status";

// ==================== Types ====================

export interface TaskEvent {
    id: string;
    status: SSEStatusType | string;
    nodeId?: string | null;
    data?: Record<string, unknown>;
}

// ==================== Global singleton ====================

const emitter = new EventEmitter();
emitter.setMaxListeners(1000);

/**
 * Running task -> AbortController mapping
 * Used to cancel running tasks
 */
const runningTasks = new Map<string, AbortController>();

// ==================== Public API ====================

/**
 * Publish task events (called by handlers)
 */
export function emitTaskEvent(taskId: string, event: TaskEvent) {
    emitter.emit(`task:${taskId}`, event);
}

/**
 * Subscribe to task events (called by SSE endpoints)
 * Return an unsubscribe function
 */
export function onTaskEvent(
    taskId: string,
    callback: (event: TaskEvent) => void,
): () => void {
    const channel = `task:${taskId}`;
    emitter.on(channel, callback);
    return () => {
        emitter.off(channel, callback);
    };
}

/**
 * Register a running task
 */
export function registerTask(taskId: string): AbortController {
    const controller = new AbortController();
    runningTasks.set(taskId, controller);
    return controller;
}

/**
 * Cancel task
 */
export function abortTask(taskId: string): boolean {
    const controller = runningTasks.get(taskId);
    if (controller) {
        controller.abort();
        runningTasks.delete(taskId);
        return true;
    }
    return false;
}

/**
 * Remove completed tasks
 */
export function removeTask(taskId: string) {
    runningTasks.delete(taskId);
}

/**
 * Check whether a task is running
 */
export function isTaskRunning(taskId: string): boolean {
    return runningTasks.has(taskId);
}

/**
 * Convenience function for sending task notifications (replaces the Python notifyTask)
 */
export function notifyTask(
    taskId: string,
    status: string,
    data?: Record<string, unknown>,
    nodeId?: string | null,
) {
    emitTaskEvent(taskId, { id: taskId, status, nodeId, data });
}
