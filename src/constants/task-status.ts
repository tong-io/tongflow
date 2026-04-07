/**
 * 统一的任务状态定义
 *
 * 状态层级:
 * - TASK_*:     单任务级别状态
 * - WORKFLOW_*: 工作流级别状态
 * - NODE_*:     节点级别状态（仅工作流使用）
 *
 * 状态生命周期:
 * PENDING -> RUNNING -> COMPLETED/FAILED/CANCELLED
 */

// ==================== 状态枚举 ====================

/**
 * 通用任务状态（单任务和工作流级别）
 */
export const TaskStatus = {
    PENDING: "PENDING", // 等待执行
    RUNNING: "RUNNING", // 执行中
    COMPLETED: "COMPLETED", // 执行完成
    FAILED: "FAILED", // 执行失败
    CANCELLED: "CANCELLED", // 已取消
} as const;

/**
 * 工作流级别状态
 */
export const WorkflowStatus = {
    WORKFLOW_STARTED: "WORKFLOW_STARTED", // 工作流开始
    WORKFLOW_COMPLETED: "WORKFLOW_COMPLETED", // 工作流完成
    WORKFLOW_FAILED: "WORKFLOW_FAILED", // 工作流失败
    WORKFLOW_CANCELLED: "WORKFLOW_CANCELLED", // 工作流取消
} as const;

/**
 * 节点级别状态
 */
export const NodeStatus = {
    NODE_STARTED: "NODE_STARTED", // 节点开始执行
    NODE_RUNNING: "NODE_RUNNING", // 节点执行中（含进度）
    NODE_COMPLETED: "NODE_COMPLETED", // 节点执行完成
    NODE_FAILED: "NODE_FAILED", // 节点执行失败
} as const;

// ==================== 类型定义 ====================

export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];
export type WorkflowStatusType =
    (typeof WorkflowStatus)[keyof typeof WorkflowStatus];
export type NodeStatusType = (typeof NodeStatus)[keyof typeof NodeStatus];

/**
 * SSE 消息中可能出现的所有状态
 */
export type SSEStatusType =
    | TaskStatusType
    | WorkflowStatusType
    | NodeStatusType;

// ==================== 状态分组 ====================

/**
 * 终态状态集合
 */
export const TERMINAL_STATUSES = new Set([
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    WorkflowStatus.WORKFLOW_COMPLETED,
    WorkflowStatus.WORKFLOW_FAILED,
    WorkflowStatus.WORKFLOW_CANCELLED,
    // 兼容旧状态
    "FINISHED",
    "ERROR",
]);

/**
 * 运行中状态集合
 */
export const RUNNING_STATUSES = new Set([
    TaskStatus.RUNNING,
    NodeStatus.NODE_STARTED,
    NodeStatus.NODE_RUNNING,
    // 兼容旧状态
    "PROCESSING",
]);

// ==================== 状态判断函数 ====================

/**
 * 判断是否为终态
 */
export function isTerminalStatus(status: string): boolean {
    return TERMINAL_STATUSES.has(status as SSEStatusType);
}

/**
 * 判断是否为运行中状态
 */
export function isRunningStatus(status: string): boolean {
    return RUNNING_STATUSES.has(status as SSEStatusType);
}

// ==================== 状态映射（SSE -> 内部状态）====================

/**
 * 将 SSE 状态映射为内部任务状态
 * 用于 use-task.ts 等前端状态管理
 */
export function mapSSEStatusToTaskStatus(
    sseStatus: string,
): "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" {
    switch (sseStatus) {
        case TaskStatus.PENDING:
            return "PENDING";

        case TaskStatus.RUNNING:
        case NodeStatus.NODE_STARTED:
        case NodeStatus.NODE_RUNNING:
        case "PROCESSING": // 兼容旧状态
            return "PROCESSING";

        case TaskStatus.COMPLETED:
        case WorkflowStatus.WORKFLOW_COMPLETED:
        case NodeStatus.NODE_COMPLETED:
        case "FINISHED": // 兼容旧状态
            return "COMPLETED";

        case TaskStatus.CANCELLED:
        case WorkflowStatus.WORKFLOW_CANCELLED:
            return "CANCELLED";

        case TaskStatus.FAILED:
        case WorkflowStatus.WORKFLOW_FAILED:
        case NodeStatus.NODE_FAILED:
        case "ERROR": // 兼容旧状态
            return "FAILED";

        default:
            return "PENDING";
    }
}
