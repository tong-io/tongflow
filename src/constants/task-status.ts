/**
 * Unified task status definitions
 *
 * Status hierarchy:
 * - TASK_*:     Single-task level status
 * - WORKFLOW_*: Workflow level status
 * - NODE_*:     Node level status (workflow only)
 *
 * Status lifecycle:
 * PENDING -> RUNNING -> COMPLETED/FAILED/CANCELLED
 */

// ==================== Status enums ====================

/**
 * General task status (single-task and workflow level)
 */
export const TaskStatus = {
    PENDING: "PENDING", // Waiting to execute
    RUNNING: "RUNNING", // Executing
    COMPLETED: "COMPLETED", // Execution completed
    FAILED: "FAILED", // Execution failed
    CANCELLED: "CANCELLED", // Cancelled
} as const;

/**
 * Workflow level status
 */
export const WorkflowStatus = {
    WORKFLOW_STARTED: "WORKFLOW_STARTED", // Workflow started
    WORKFLOW_COMPLETED: "WORKFLOW_COMPLETED", // Workflow completed
    WORKFLOW_FAILED: "WORKFLOW_FAILED", // Workflow failed
    WORKFLOW_CANCELLED: "WORKFLOW_CANCELLED", // Workflow cancelled
} as const;

/**
 * Node level status
 */
export const NodeStatus = {
    NODE_STARTED: "NODE_STARTED", // Node started executing
    NODE_RUNNING: "NODE_RUNNING", // Node executing (with progress)
    NODE_COMPLETED: "NODE_COMPLETED", // Node execution completed
    NODE_FAILED: "NODE_FAILED", // Node execution failed
} as const;

// ==================== Type definitions ====================

export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];
export type WorkflowStatusType =
    (typeof WorkflowStatus)[keyof typeof WorkflowStatus];
export type NodeStatusType = (typeof NodeStatus)[keyof typeof NodeStatus];

/**
 * All statuses that may appear in SSE messages
 */
export type SSEStatusType =
    | TaskStatusType
    | WorkflowStatusType
    | NodeStatusType;

// ==================== Status groups ====================

/**
 * Set of terminal statuses
 */
export const TERMINAL_STATUSES = new Set([
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    WorkflowStatus.WORKFLOW_COMPLETED,
    WorkflowStatus.WORKFLOW_FAILED,
    WorkflowStatus.WORKFLOW_CANCELLED,
]);

/**
 * Set of running statuses
 */
export const RUNNING_STATUSES = new Set([
    TaskStatus.RUNNING,
    NodeStatus.NODE_STARTED,
    NodeStatus.NODE_RUNNING,
]);

// ==================== Status predicate functions ====================

/**
 * Check whether the status is a terminal status
 */
export function isTerminalStatus(status: string): boolean {
    return (TERMINAL_STATUSES as ReadonlySet<string>).has(status);
}

/**
 * Check whether the status is a running status
 */
export function isRunningStatus(status: string): boolean {
    return (RUNNING_STATUSES as ReadonlySet<string>).has(status);
}

// ==================== Status mapping (SSE -> internal status) ====================

/**
 * Map SSE status to internal task status
 * Used in use-task.ts and other front-end state management
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
            return "PROCESSING";

        case TaskStatus.COMPLETED:
        case WorkflowStatus.WORKFLOW_COMPLETED:
        case NodeStatus.NODE_COMPLETED:
            return "COMPLETED";

        case TaskStatus.CANCELLED:
        case WorkflowStatus.WORKFLOW_CANCELLED:
            return "CANCELLED";

        case TaskStatus.FAILED:
        case WorkflowStatus.WORKFLOW_FAILED:
        case NodeStatus.NODE_FAILED:
            return "FAILED";

        default:
            return "PENDING";
    }
}
