/**
 * Task dispatcher
 *
 * Routes to the matching handler based on task type + function.
 * Replaces the start_task / _execute_* functions from the Python main.py.
 */

import { eq } from "drizzle-orm";
import { TaskStatus, WorkflowStatus } from "@/constants/task-status";
import { getDb, tasks, workflows } from "@/db";
import { ABI_NODES, type NodeSlot } from "@/generated/abi";
import { logger } from "@/lib/logger";
import { executePlugin } from "@/lib/plugin-executor/execute";
import { prepareAssetInput } from "@/lib/plugin-executor/prepare-asset-input.server";
import { serializeTaskErrorForDb } from "@/lib/task/error-envelope";
import { notifyTask, registerTask, removeTask } from "./emitter";
import { executeWorkflowViaEngine } from "./engine-delegate.server";

export function isNodeSlot(s: string): s is NodeSlot {
    return Object.hasOwn(ABI_NODES, s);
}

// ==================== Types ====================

export interface TaskData {
    taskId: string;
    nodeSlot: NodeSlot;
    pluginId: string;
    prompt: Record<string, unknown>;
    nodeId: string;
    workflowId?: number | null;
}

export interface HandlerResult {
    success?: boolean;
    file_key?: string;
    file_keys?: string[];
    text?: string;
    texts?: string[];
    result?: string;
    [key: string]: unknown;
}

export async function loadTaskData(taskId: string): Promise<TaskData | null> {
    const db = await getDb();

    const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
    });

    if (!task) return null;

    const prompt = JSON.parse(task.prompt) as Record<string, unknown>;
    const pluginId = (task.pluginId ?? "").trim();
    const nodeSlot = (task.feature ?? "").trim();

    if (!pluginId) return null;
    if (!nodeSlot) return null;
    if (!isNodeSlot(nodeSlot)) return null;

    return {
        taskId: task.id,
        nodeSlot,
        pluginId,
        prompt,
        nodeId: task.nodeId,
        workflowId: task.workflowId,
    };
}

/**
 * SSE entry point. Inspects the task row and routes single-node tasks to
 * `executeTask` and workflow tasks (`feature === "workflow"`) to
 * `executeWorkflowViaEngine` (the SDK engine), loading the workflow's
 * executable JSON on the way.
 */
export async function dispatchTask(taskId: string): Promise<void> {
    const db = await getDb();
    const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
    });

    if (!task) {
        notifyTask(
            taskId,
            TaskStatus.FAILED,
            { message: "Task not found or expired" },
            null,
        );
        return;
    }

    if (task.feature === "workflow") {
        if (!task.workflowId) {
            notifyTask(
                taskId,
                WorkflowStatus.WORKFLOW_FAILED,
                { message: "Workflow task missing workflowId" },
                null,
            );
            return;
        }
        const wf = await db.query.workflows.findFirst({
            where: eq(workflows.id, task.workflowId),
        });
        if (!wf?.executable) {
            notifyTask(
                taskId,
                WorkflowStatus.WORKFLOW_FAILED,
                { message: "Workflow not found or has no executable data" },
                null,
            );
            return;
        }
        return executeWorkflowViaEngine(taskId, wf.executable, {});
    }

    return executeTask(taskId);
}

/**
 * Execute a task (called by the SSE endpoint)
 *
 * Flow:
 * 1. Load task data from the DB
 * 2. Register AbortController
 * 3. Route to the matching handler
 * 4. Send completion/failure notifications
 * 5. Update DB status
 */
export async function executeTask(taskId: string): Promise<void> {
    const taskData = await loadTaskData(taskId);
    if (!taskData) {
        notifyTask(
            taskId,
            TaskStatus.FAILED,
            { message: "Task not found or expired" },
            null,
        );
        return;
    }

    const controller = registerTask(taskId);

    try {
        // Mark task running in DB
        const db = await getDb();
        await db
            .update(tasks)
            .set({ status: "processing" })
            .where(eq(tasks.id, taskId));

        logger.info(
            `[TaskRunner] task=${taskId} starting nodeSlot=${taskData.nodeSlot} plugin=${taskData.pluginId} nodeId=${taskData.nodeId}`,
        );

        notifyTask(
            taskId,
            TaskStatus.RUNNING,
            { message: "Task started" },
            taskData.nodeId,
        );

        // Resolve `$ref: Asset` fields (fileKey/URL/dataURL → inline bytes),
        // then hand the payload straight to the plugin. The contract is
        // enforced by the generated Pydantic models on the plugin side; the
        // runner does not validate at runtime.
        logger.info(`[TaskRunner] task=${taskId} preparing assets`);
        const businessInput = await prepareAssetInput(
            taskData.nodeSlot,
            taskData.prompt,
        );
        logger.info(
            `[TaskRunner] task=${taskId} assets ready, invoking plugin`,
        );
        const result = await executePlugin({
            pluginId: taskData.pluginId,
            nodeSlot: taskData.nodeSlot,
            input: businessInput as never,
            taskId,
            signal: controller.signal,
        });

        // Abort if executor cancelled early
        if (controller.signal.aborted) {
            return; // Cancel notifications come from abortTask
        }

        if (result == null || typeof result !== "object") {
            throw new Error("Handler returned no result");
        }

        // Emit completion payloads
        if (result.success === false) {
            const rec = result as Record<string, unknown>;
            const rawErr = rec.error;
            const failMsg =
                typeof rawErr === "string" && rawErr.trim().length > 0
                    ? rawErr.trim()
                    : "Task failed";
            logger.info(
                `[TaskRunner] task=${taskId} plugin returned success=false: ${failMsg}`,
            );
            notifyTask(
                taskId,
                TaskStatus.FAILED,
                result as Record<string, unknown>,
                taskData.nodeId,
            );
            await db
                .update(tasks)
                .set({
                    status: "failed",
                    error: serializeTaskErrorForDb({ message: failMsg }),
                })
                .where(eq(tasks.id, taskId));
        } else {
            logger.info(
                `[TaskRunner] task=${taskId} plugin returned success=true`,
            );
            notifyTask(
                taskId,
                TaskStatus.COMPLETED,
                result as Record<string, unknown>,
                taskData.nodeId,
            );
            await db
                .update(tasks)
                .set({
                    status: "completed",
                    result: JSON.stringify(result),
                })
                .where(eq(tasks.id, taskId));
        }
    } catch (error) {
        if (controller.signal.aborted) return;

        const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
        const errorStack =
            error instanceof Error && error.stack ? error.stack : errorMsg;
        logger.error(`[TaskRunner] Task ${taskId} failed:\n${errorStack}`);

        notifyTask(
            taskId,
            TaskStatus.FAILED,
            {
                message: "Task execution failed",
                error: errorMsg,
            },
            taskData.nodeId,
        );

        const db = await getDb();
        await db
            .update(tasks)
            .set({
                status: "failed",
                error: serializeTaskErrorForDb({ message: errorMsg }),
            })
            .where(eq(tasks.id, taskId));
    } finally {
        removeTask(taskId);
    }
}
