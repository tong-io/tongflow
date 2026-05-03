/**
 * Task dispatcher
 *
 * Routes to the matching handler based on task type + function.
 * Replaces the start_task / _execute_* functions from the Python main.py.
 */

import { getDb, tasks } from "@/db";
import { eq } from "drizzle-orm";
import { executePlugin } from "@/lib/plugin-executor/execute";
import { notifyTask, registerTask, removeTask, emitTaskEvent } from "./task-emitter";
import {
    TaskStatus,
    WorkflowStatus,
    NodeStatus,
} from "@/constants/task-status";
import { logger } from "@/lib/logger";

// ==================== Types ====================

export interface TaskData {
    taskId: string;
    nodeSlot: string;
    pluginId: string;
    prompt: Record<string, unknown>;
    nodeId: string;
    workflowId?: number | null;
    /** @deprecated legacy */
    feature?: string;
    /** @deprecated legacy */
    type?: string;
    /** @deprecated legacy */
    function?: string;
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

const LEGACY_PLUGIN_ID_MAP: Record<string, string> = {
    "tongflow-llm-gemini": "tongflow-llm-gemini-text",
    "tongflow-llm-openai": "tongflow-llm-openai-text",
    "tongflow-llm-openrouter-free": "tongflow-llm-openrouter-free",
    "openrouter-free": "tongflow-llm-openrouter-free",
    "tongflow-modal-Qwen3-ASR": "tongflow-modal-qwen3asr",
    "tongflow-modal-cpu-crawl4ai-app": "tongflow-modal-crawl4ai",
    "tongflow-modal-cpu-docling": "tongflow-modal-docling",
    "tongflow-modal-cpu-ffmpeg": "tongflow-modal-ffmpeg",
    "tongflow-modal-cpu-paddle": "tongflow-modal-paddle",
    "tongflow-modal-cpu-pyscenedetect": "tongflow-modal-pyscenedetect",
    "tongflow-modal-cpu-whisper": "tongflow-modal-whisper",
    "tongflow-modal-gpu-ace-step": "tongflow-modal-ace-step",
    "tongflow-modal-gpu-color-fix-lab": "tongflow-modal-color-fix-lab",
    "tongflow-modal-gpu-color_fix_lab": "tongflow-modal-color-fix-lab",
    "tongflow-modal-gpu-ernie-image": "tongflow-modal-ernie-image",
    "tongflow-modal-gpu-flux2-klein9b": "tongflow-modal-flux2-klein9b",
    "tongflow-modal-gpu-gemma4": "tongflow-modal-gemma4",
    "tongflow-modal-gpu-ltx": "tongflow-modal-ltx",
    "tongflow-modal-gpu-qwen3asr": "tongflow-modal-qwen3asr",
    "tongflow-modal-gpu-qwen3tts": "tongflow-modal-qwen3tts",
    "tongflow-modal-gpu-seedvr2": "tongflow-modal-seedvr2",
    "tongflow-modal-gpu-z-image": "tongflow-modal-z-image",
    "ace-step": "tongflow-modal-ace-step",
    "color-fix-lab": "tongflow-modal-color-fix-lab",
    "crawl4ai": "tongflow-modal-crawl4ai",
    "docling": "tongflow-modal-docling",
    "ernie-image": "tongflow-modal-ernie-image",
    "ffmpeg": "tongflow-modal-ffmpeg",
    "flux2-klein9b": "tongflow-modal-flux2-klein9b",
    "gemini-text": "tongflow-llm-gemini-text",
    "gemma4": "tongflow-modal-gemma4",
    "ltx": "tongflow-modal-ltx",
    "openai-text": "tongflow-llm-openai-text",
    "paddle": "tongflow-modal-paddle",
    "pyscenedetect": "tongflow-modal-pyscenedetect",
    "qwen3asr": "tongflow-modal-qwen3asr",
    "qwen3tts": "tongflow-modal-qwen3tts",
    "seedvr2": "tongflow-modal-seedvr2",
    "whisper": "tongflow-modal-whisper",
    "z-image": "tongflow-modal-z-image",
};

function normalizePluginId(pluginId: string): string {
    return LEGACY_PLUGIN_ID_MAP[pluginId] ?? pluginId;
}

/**
 * Handler function signature
 */
export type TaskHandler = (
    task: TaskData,
    signal: AbortSignal,
) => Promise<HandlerResult>;

/**
 * @deprecated Legacy handler registry has been retired.
 * Kept as a no-op export to avoid breaking older imports.
 */
export function registerHandler(
    _type: string,
    _fn: string,
    _handler: TaskHandler,
): void {
    // no-op
}

export async function loadTaskData(taskId: string): Promise<TaskData | null> {
    const db = await getDb();

    const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
    });

    if (!task) return null;

    const prompt = JSON.parse(task.prompt) as Record<string, unknown>;
    const pluginId =
        typeof prompt.pluginId === "string"
            ? normalizePluginId(prompt.pluginId.trim())
            : "";
    const nodeSlot =
        (typeof prompt.nodeSlot === "string" && prompt.nodeSlot.trim()) ||
        (typeof task.feature === "string" ? task.feature.trim() : "");

    if (!pluginId) return null;
    if (!nodeSlot) return null;

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
            { message: "任务不存在或已过期" },
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

        notifyTask(taskId, TaskStatus.RUNNING, { message: "任务开始执行" }, taskData.nodeId);

        // Hard requirement: pluginId + nodeSlot must exist (platform-agnostic core).
        const result = await executePlugin({
            pluginId: taskData.pluginId,
            nodeSlot: taskData.nodeSlot,
            input: taskData.prompt,
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
                    error: JSON.stringify(result),
                })
                .where(eq(tasks.id, taskId));
        } else {
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
        logger.error(`[TaskRunner] Task ${taskId} failed:`, errorMsg);

        notifyTask(
            taskId,
            TaskStatus.FAILED,
            {
                message: "任务执行失败",
                error: errorMsg,
            },
            taskData.nodeId,
        );

        const db = await getDb();
        await db
            .update(tasks)
            .set({ status: "failed", error: errorMsg })
            .where(eq(tasks.id, taskId));
    } finally {
        removeTask(taskId);
    }
}

/**
 * Execute workflow task
 */
export async function executeWorkflowTask(
    taskId: string,
    workflowJson: string,
    inputs: Record<string, unknown>,
): Promise<void> {
    const controller = registerTask(taskId);

    try {
        const db = await getDb();
        await db
            .update(tasks)
            .set({ status: "processing" })
            .where(eq(tasks.id, taskId));

        const workflow = JSON.parse(workflowJson);
        const execNodes = workflow.executableNodes || [];
        const nodesInfo = execNodes.map(
            (node: { id: string; label?: string; feature?: string }) => ({
                id: node.id,
                label: node.label || node.feature || "",
                feature: node.feature || "",
            }),
        );

        // Announce workflow execution start
        notifyTask(taskId, WorkflowStatus.WORKFLOW_STARTED, {
            totalNodes: execNodes.length,
            levels: (workflow.executionLevels || []).length,
            nodes: nodesInfo,
        });

        // callApi bridge used by the workflow runner to spawn child tasks
        async function callApi(
            feature: string,
            params: Record<string, unknown>,
        ): Promise<Record<string, unknown>> {
            const pluginId =
                typeof params.pluginId === "string" ? params.pluginId.trim() : "";
            const nodeSlot =
                typeof params.nodeSlot === "string" && params.nodeSlot.trim()
                    ? params.nodeSlot.trim()
                    : feature;

            if (!pluginId) {
                throw new Error(
                    `Missing pluginId for nodeSlot=${nodeSlot}. Please select a plugin implementation in the node UI.`,
                );
            }

            return await executePlugin({
                pluginId,
                nodeSlot,
                input: params,
                taskId,
                signal: controller.signal,
            });
        }

        // Execute nodes tier-by-tier
        const executionLevels: string[][] = workflow.executionLevels || [];
        const dataNodes: Record<string, unknown>[] = workflow.dataNodes || [];
        const nodeOutputs = new Map<string, Record<string, unknown>>();
        const errors: string[] = [];
        const startTime = Date.now();

        for (let levelIdx = 0; levelIdx < executionLevels.length; levelIdx++) {
            if (controller.signal.aborted) {
                notifyTask(taskId, WorkflowStatus.WORKFLOW_CANCELLED, {
                    message: "工作流已取消",
                });
                return;
            }

            const level = executionLevels[levelIdx];
            const levelExecNodes = level
                .map((nodeId: string) =>
                    execNodes.find((n: { id: string }) => n.id === nodeId),
                )
                .filter(Boolean);

            for (const node of levelExecNodes) {
                if (controller.signal.aborted) {
                    notifyTask(taskId, WorkflowStatus.WORKFLOW_CANCELLED, {
                        message: "工作流已取消",
                    });
                    return;
                }

                const nodeId = node.id;
                const nodeLabel = node.label || node.feature || "";
                const nodeStartTime = Date.now();

                notifyTask(
                    taskId,
                    NodeStatus.NODE_STARTED,
                    {
                        level: levelIdx + 1,
                        feature: node.feature || "",
                        label: nodeLabel,
                    },
                    nodeId,
                );

                try {
                    // Resolve node inputs from upstream outputs / workflow payloads
                    const params = resolveNodeParams(
                        node,
                        nodeOutputs,
                        dataNodes,
                        inputs,
                    );

                    const result = await callApi(node.feature, params);
                    nodeOutputs.set(nodeId, result);

                    notifyTask(
                        taskId,
                        NodeStatus.NODE_COMPLETED,
                        {
                            output: result,
                            duration: Date.now() - nodeStartTime,
                            label: nodeLabel,
                        },
                        nodeId,
                    );
                } catch (e) {
                    const errMsg =
                        e instanceof Error ? e.message : "Unknown error";
                    errors.push(`Node ${nodeId} failed: ${errMsg}`);

                    notifyTask(
                        taskId,
                        NodeStatus.NODE_FAILED,
                        {
                            message: "节点执行失败",
                            error: errMsg,
                            label: nodeLabel,
                        },
                        nodeId,
                    );
                    break;
                }
            }

            if (errors.length > 0) break;
        }

        // Aggregate outputs and notify listeners
        const totalDuration = Date.now() - startTime;
        const outputs = Object.fromEntries(nodeOutputs);

        if (errors.length === 0) {
            notifyTask(taskId, WorkflowStatus.WORKFLOW_COMPLETED, {
                status: "success",
                outputs,
                totalDuration,
            });
            await db
                .update(tasks)
                .set({ status: "completed", result: JSON.stringify(outputs) })
                .where(eq(tasks.id, taskId));
        } else {
            notifyTask(taskId, WorkflowStatus.WORKFLOW_FAILED, {
                status: "failed",
                outputs,
                totalDuration,
                errors,
            });
            await db
                .update(tasks)
                .set({ status: "failed", error: errors.join("; ") })
                .where(eq(tasks.id, taskId));
        }
    } catch (error) {
        if (controller.signal.aborted) return;

        const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
        logger.error(`[Workflow] Task ${taskId} failed:`, errorMsg);

        notifyTask(taskId, WorkflowStatus.WORKFLOW_FAILED, {
            message: "工作流执行失败",
            error: errorMsg,
        });

        const db = await getDb();
        await db
            .update(tasks)
            .set({ status: "failed", error: errorMsg })
            .where(eq(tasks.id, taskId));
    } finally {
        removeTask(taskId);
    }
}

// ==================== Utilities ====================

/**
 * Resolve node parameters: get parameter values from upstream node outputs and workflow inputs
 */
function resolveNodeParams(
    node: {
        id: string;
        params?: Array<{
            name: string;
            mapping?: { sourceNodeId: string; sourceParam: string };
            value?: unknown;
        }>;
    },
    nodeOutputs: Map<string, Record<string, unknown>>,
    dataNodes: Record<string, unknown>[],
    inputs: Record<string, unknown>,
): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (!node.params) return params;

    for (const param of node.params) {
        if (param.mapping) {
            // Pull values from ancestor node outputs
            const sourceOutput = nodeOutputs.get(param.mapping.sourceNodeId);
            if (sourceOutput) {
                params[param.name] = sourceOutput[param.mapping.sourceParam];
            }
        } else if (param.value !== undefined) {
            params[param.name] = param.value;
        }
    }

    return params;
}
