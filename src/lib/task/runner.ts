/**
 * Task dispatcher
 *
 * Routes to the matching handler based on task type + function.
 * Replaces the start_task / _execute_* functions from the Python main.py.
 */

import { eq } from "drizzle-orm";
import {
    NodeStatus,
    TaskStatus,
    WorkflowStatus,
} from "@/constants/task-status";
import { getDb, tasks, workflows } from "@/db";
import { ABI_NODES, type NodeSlot } from "@/generated/abi";
import { logger } from "@/lib/logger";
import { executePlugin } from "@/lib/plugin-executor/execute";
import { prepareAssetInput } from "@/lib/plugin-executor/prepare-asset-input.server";
import {
    type SerializedWorkflowFailure,
    serializeTaskErrorForDb,
    workflowTaskFailureEnvelope,
} from "@/lib/task/error-envelope";
import { notifyTask, registerTask, removeTask } from "./emitter";

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
 * `executeWorkflowTask`, loading the workflow's executable JSON on the way.
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
        return executeWorkflowTask(taskId, wf.executable, {});
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
        const businessInput = await prepareAssetInput(
            taskData.nodeSlot,
            taskData.prompt,
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

        // callApi bridge used by the workflow runner to spawn child tasks.
        async function callApi(
            node: { feature: string; pluginId: string },
            params: Record<string, unknown>,
        ): Promise<Record<string, unknown>> {
            const pluginId = (node.pluginId ?? "").trim();
            const nodeSlot = (node.feature ?? "").trim();

            if (!pluginId) {
                throw new Error(
                    `Missing pluginId for nodeSlot=${nodeSlot}. Please select a plugin implementation in the node UI.`,
                );
            }

            if (!isNodeSlot(nodeSlot)) {
                throw new Error(
                    `Invalid nodeSlot=${nodeSlot}: not in ABI. Cannot execute workflow node.`,
                );
            }

            const businessInput = await prepareAssetInput(nodeSlot, params);
            const result = await executePlugin({
                pluginId,
                nodeSlot,
                input: businessInput as never,
                taskId,
                signal: controller.signal,
            });

            return result as Record<string, unknown>;
        }

        // Execute nodes tier-by-tier
        const executionLevels: string[][] = workflow.executionLevels || [];
        const dataNodes = (workflow.dataNodes ?? []) as DataNodeStub[];
        const nodeOutputs = new Map<string, Record<string, unknown>>();
        const workflowErrorSummaries: string[] = [];
        const workflowFailures: SerializedWorkflowFailure[] = [];
        const startTime = Date.now();

        for (let levelIdx = 0; levelIdx < executionLevels.length; levelIdx++) {
            if (controller.signal.aborted) {
                notifyTask(taskId, WorkflowStatus.WORKFLOW_CANCELLED, {
                    message: "Workflow canceled",
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
                        message: "Workflow canceled",
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

                    const result = await callApi(node, params);
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
                    const summaryLine = `Node ${nodeId} failed: ${errMsg}`;
                    workflowErrorSummaries.push(summaryLine);

                    workflowFailures.push({
                        nodeId,
                        summary: errMsg,
                    });

                    notifyTask(
                        taskId,
                        NodeStatus.NODE_FAILED,
                        {
                            message: "Node execution failed",
                            error: errMsg,
                            label: nodeLabel,
                        },
                        nodeId,
                    );
                    break;
                }
            }

            if (workflowErrorSummaries.length > 0) break;
        }

        // Aggregate outputs and notify listeners
        const totalDuration = Date.now() - startTime;
        const outputs = Object.fromEntries(nodeOutputs);

        if (workflowErrorSummaries.length === 0) {
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
                errors: workflowErrorSummaries,
                failures: workflowFailures,
            });
            await db
                .update(tasks)
                .set({
                    status: "failed",
                    error: serializeTaskErrorForDb(
                        workflowTaskFailureEnvelope(
                            workflowErrorSummaries,
                            workflowFailures,
                        ),
                    ),
                })
                .where(eq(tasks.id, taskId));
        }
    } catch (error) {
        if (controller.signal.aborted) return;

        const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
        logger.error(`[Workflow] Task ${taskId} failed:`, errorMsg);

        notifyTask(taskId, WorkflowStatus.WORKFLOW_FAILED, {
            message: "Workflow execution failed",
            error: errorMsg,
        });

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

// ==================== Utilities ====================

/**
 * Read a value out of a nested object via a path like `texts[0]` or `fileKeys`.
 */
function readByPath(obj: unknown, path: string): unknown {
    if (obj === null || obj === undefined) return undefined;
    const parts = path.split(".");
    let cur: unknown = obj;
    for (const part of parts) {
        if (cur === null || cur === undefined) return undefined;
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
            const [, key, idx] = arrayMatch;
            const arr = (cur as Record<string, unknown>)[key];
            cur = Array.isArray(arr) ? arr[parseInt(idx, 10)] : undefined;
        } else {
            cur = (cur as Record<string, unknown>)[part];
        }
    }
    return cur;
}

interface DataNodeStub {
    id: string;
    staticData?: { texts?: string[]; fileKeys?: string[] };
    inputName?: string;
}

type FieldBinding =
    | {
          kind: "handle";
          sources: { fromNodeId: string; fromField: string }[];
          targetHandle: string;
          collect?: true;
      }
    | { kind: "config"; value: unknown }
    | { kind: "static"; value: unknown }
    | { kind: "input"; inputName: string };

/**
 * Resolve a node's ABI input parameters from its `bindings` table, the live
 * upstream outputs map, the workflow's data nodes (static / input payloads),
 * and the workflow-level input map.
 */
function resolveNodeParams(
    node: {
        id: string;
        bindings?: Record<string, FieldBinding>;
    },
    nodeOutputs: Map<string, Record<string, unknown>>,
    dataNodes: DataNodeStub[],
    inputs: Record<string, unknown>,
): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (!node.bindings) return params;

    const dataNodeMap = new Map(dataNodes.map((d) => [d.id, d]));

    const readSource = (fromNodeId: string, fromField: string): unknown => {
        const live = nodeOutputs.get(fromNodeId);
        if (live !== undefined) return readByPath(live, fromField);

        const dn = dataNodeMap.get(fromNodeId);
        if (!dn) return undefined;
        if (dn.staticData) {
            const fromStatic = readByPath(dn.staticData, fromField);
            if (fromStatic !== undefined) return fromStatic;
        }
        if (dn.inputName && inputs[dn.inputName] !== undefined) {
            return readByPath(inputs[dn.inputName], fromField);
        }
        return undefined;
    };

    for (const [field, binding] of Object.entries(node.bindings)) {
        switch (binding.kind) {
            case "handle": {
                if (binding.collect) {
                    params[field] = binding.sources
                        .map((s) => readSource(s.fromNodeId, s.fromField))
                        .filter((v) => v !== undefined);
                } else {
                    const first = binding.sources[0];
                    if (first) {
                        params[field] = readSource(
                            first.fromNodeId,
                            first.fromField,
                        );
                    }
                }
                break;
            }
            case "config":
            case "static":
                params[field] = binding.value;
                break;
            case "input":
                params[field] = inputs[binding.inputName];
                break;
        }
    }
    return params;
}
