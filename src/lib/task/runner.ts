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
import { getAbiOutputRoutesBySlot } from "@/lib/schema/tongflow-abi";
import {
    type SerializedWorkflowFailure,
    serializeTaskErrorForDb,
    workflowTaskFailureEnvelope,
} from "@/lib/task/error-envelope";
import { type AbiOutputView, computeOutputView } from "@/lib/task/payload";
import type { OutputRoute } from "@/lib/workflow/executable-workflow";
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
        // Raw plugin outputs (kept for the final aggregate notification only).
        const nodeOutputs = new Map<string, Record<string, unknown>>();
        // ABI-projected views per executable node — what downstream bindings read.
        const outputViews = new Map<string, AbiOutputView>();
        // Live canvas-side data node state. Seeded from staticData (and workflow
        // inputs at first read); written after each executable completes via
        // its `downstreamDataNodeId` routes. Keys are `texts` / `fileKeys`.
        const dataNodeState = new Map<
            string,
            { texts?: string[]; fileKeys?: string[] }
        >();
        for (const dn of dataNodes) {
            if (dn.staticData) {
                const slot: { texts?: string[]; fileKeys?: string[] } = {};
                if (dn.staticData.texts && dn.staticData.texts.length > 0) {
                    slot.texts = dn.staticData.texts;
                }
                if (
                    dn.staticData.fileKeys &&
                    dn.staticData.fileKeys.length > 0
                ) {
                    slot.fileKeys = dn.staticData.fileKeys;
                }
                if (slot.texts || slot.fileKeys) {
                    dataNodeState.set(dn.id, slot);
                }
            }
        }
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
                    // Resolve node inputs from upstream views / data node state / workflow inputs
                    const params = resolveNodeParams(
                        node,
                        outputViews,
                        dataNodeState,
                        dataNodes,
                        inputs,
                    );

                    const result = await callApi(node, params);
                    nodeOutputs.set(nodeId, result);

                    // Project the raw plugin output into the ABI-shaped view
                    // (asset $ref → file_key string, scalar → length-1 array).
                    const routes: OutputRoute[] = Array.isArray(node.outputs)
                        ? (node.outputs as OutputRoute[])
                        : getAbiOutputRoutesBySlot(node.feature ?? "").map(
                              (r) => ({
                                  sourceField: r.sourceField,
                                  nodeType: r.nodeType,
                                  dataField: r.dataField,
                                  expandEach: r.expandEach,
                                  ...(r.itemValuePath
                                      ? { itemValuePath: r.itemValuePath }
                                      : {}),
                                  ...(r.isArrayOfArrays
                                      ? { isArrayOfArrays: r.isArrayOfArrays }
                                      : {}),
                              }),
                          );
                    const view = computeOutputView(routes, result);
                    outputViews.set(nodeId, view);
                    // Refresh any downstream data nodes this executable directly feeds.
                    for (const route of routes) {
                        const targetId = route.downstreamDataNodeId;
                        if (!targetId) continue;
                        const channel = view[route.sourceField];
                        if (!channel) continue;
                        const slot = dataNodeState.get(targetId) ?? {};
                        if (route.dataField === "texts") {
                            slot.texts = channel.values;
                        } else {
                            slot.fileKeys = channel.values;
                        }
                        dataNodeState.set(targetId, slot);
                    }

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
          consumerShape: "scalar" | "array";
      }
    | { kind: "config"; value: unknown }
    | { kind: "static"; value: unknown }
    | { kind: "input"; inputName: string };

/**
 * Resolve a node's ABI input parameters from its `bindings` table, the live
 * `outputViews` map (per-executable ABI projection), the `dataNodeState` map
 * (canvas-side data nodes, seeded from staticData and refreshed after each
 * executable that feeds them), and the workflow-level input map.
 *
 * `fromField` resolves either to an upstream ABI sourceField (executable side)
 * or to a `texts` / `fileKeys` slot (data node side). Returned values are
 * always normalized to string[] before shape coercion.
 */
function resolveNodeParams(
    node: {
        id: string;
        bindings?: Record<string, FieldBinding>;
    },
    outputViews: Map<string, AbiOutputView>,
    dataNodeState: Map<string, { texts?: string[]; fileKeys?: string[] }>,
    dataNodes: DataNodeStub[],
    inputs: Record<string, unknown>,
): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (!node.bindings) return params;

    const dataNodeMap = new Map(dataNodes.map((d) => [d.id, d]));

    const readSource = (fromNodeId: string, fromField: string): string[] => {
        // 1) Upstream executable: read the projected view.
        const view = outputViews.get(fromNodeId);
        if (view) {
            const channel = view[fromField];
            return channel ? channel.values : [];
        }
        // 2) Upstream data node: read live state (texts / fileKeys).
        const slot = dataNodeState.get(fromNodeId);
        if (slot) {
            if (fromField === "texts" && slot.texts) return slot.texts;
            if (fromField === "fileKeys" && slot.fileKeys) return slot.fileKeys;
        }
        // 3) Workflow input fallback (data node with inputName).
        const dn = dataNodeMap.get(fromNodeId);
        if (dn?.inputName) {
            const supplied = inputs[dn.inputName];
            if (
                supplied &&
                typeof supplied === "object" &&
                !Array.isArray(supplied)
            ) {
                const obj = supplied as Record<string, unknown>;
                const arr = obj[fromField];
                if (Array.isArray(arr))
                    return (arr as unknown[]).map((v) => String(v));
            } else if (Array.isArray(supplied)) {
                return (supplied as unknown[]).map((v) => String(v));
            } else if (typeof supplied === "string") {
                return [supplied];
            }
        }
        return [];
    };

    for (const [field, binding] of Object.entries(node.bindings)) {
        switch (binding.kind) {
            case "handle": {
                const collected: string[] = [];
                for (const s of binding.sources) {
                    const values = readSource(s.fromNodeId, s.fromField);
                    for (const v of values) collected.push(v);
                }
                if (binding.consumerShape === "scalar") {
                    if (collected.length > 0) params[field] = collected[0];
                } else {
                    params[field] = collected;
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
