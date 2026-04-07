/**
 * 全局任务事件系统
 *
 * 替代 Redis pub/sub，使用进程内 EventEmitter 实现实时通知。
 * SSE 端点监听事件，handler 发布事件。
 */

import { EventEmitter } from "node:events";
import { type SSEStatusType, isTerminalStatus } from "@/constants/task-status";

// ==================== 类型定义 ====================

export interface TaskEvent {
    id: string;
    status: SSEStatusType | string;
    nodeId?: string | null;
    data?: Record<string, unknown>;
}

// ==================== 全局单例 ====================

const emitter = new EventEmitter();
emitter.setMaxListeners(1000);

/**
 * 运行中的任务 → AbortController 映射
 * 用于取消正在执行的任务
 */
const runningTasks = new Map<string, AbortController>();

// ==================== 公共 API ====================

/**
 * 发布任务事件（handler 调用）
 */
export function emitTaskEvent(taskId: string, event: TaskEvent) {
    emitter.emit(`task:${taskId}`, event);
}

/**
 * 订阅任务事件（SSE 端点调用）
 * 返回取消订阅函数
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
 * 注册运行中的任务
 */
export function registerTask(taskId: string): AbortController {
    const controller = new AbortController();
    runningTasks.set(taskId, controller);
    return controller;
}

/**
 * 取消任务
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
 * 移除已完成的任务
 */
export function removeTask(taskId: string) {
    runningTasks.delete(taskId);
}

/**
 * 检查任务是否正在运行
 */
export function isTaskRunning(taskId: string): boolean {
    return runningTasks.has(taskId);
}

/**
 * 发送任务通知的便捷函数（替代 Python 版的 notifyTask）
 */
export function notifyTask(
    taskId: string,
    status: string,
    data?: Record<string, unknown>,
    nodeId?: string | null,
) {
    emitTaskEvent(taskId, { id: taskId, status, nodeId, data });
}
