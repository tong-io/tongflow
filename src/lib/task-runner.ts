/**
 * 任务分发器
 *
 * 根据任务的 type + function 路由到对应的 handler。
 * 替代 Python 版 main.py 中的 start_task / _execute_* 函数。
 */

import { getDb, tasks } from "@/db";
import { eq } from "drizzle-orm";
import { getFeatureByName } from "@/lib/feature-registry";
import {
    notifyTask,
    registerTask,
    removeTask,
    emitTaskEvent,
} from "./task-emitter";
import {
    TaskStatus,
    WorkflowStatus,
    NodeStatus,
} from "@/constants/task-status";

// ==================== 类型定义 ====================

export interface TaskData {
    taskId: string;
    userId: string;
    feature: string;
    type: string;
    function: string;
    prompt: Record<string, unknown>;
    nodeId: string;
    workflowId?: number | null;
    shareId?: number | null;
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

/**
 * Handler 函数签名
 */
export type TaskHandler = (
    task: TaskData,
    signal: AbortSignal,
) => Promise<HandlerResult>;

// ==================== Handler 注册表 ====================

const handlers = new Map<string, Map<string, TaskHandler>>();

/**
 * 注册一个 handler
 * @param type 任务类型 (llm, api, gpu, cpu, link)
 * @param fn 函数名
 * @param handler 处理函数
 */
export function registerHandler(
    type: string,
    fn: string,
    handler: TaskHandler,
) {
    if (!handlers.has(type)) {
        handlers.set(type, new Map());
    }
    handlers.get(type)!.set(fn, handler);
}

/**
 * 获取 handler
 */
function getHandler(type: string, fn: string): TaskHandler | undefined {
    return handlers.get(type)?.get(fn);
}

// ==================== 核心执行逻辑 ====================

/**
 * 从数据库加载任务并准备执行数据
 */
async function ensureHandlers(): Promise<void> {
    const { ensureHandlersRegistered } = await import(
        "@/lib/register-task-handlers"
    );
    ensureHandlersRegistered();
}

export async function loadTaskData(taskId: string): Promise<TaskData | null> {
    const db = await getDb();

    const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
    });

    if (!task) return null;

    // 从注册表获取 feature 的 type 和 function
    const featureData = getFeatureByName(task.feature);

    if (!featureData) return null;

    return {
        taskId: task.id,
        userId: task.userId,
        feature: task.feature,
        type: featureData.type,
        function: featureData.function,
        prompt: JSON.parse(task.prompt),
        nodeId: task.nodeId,
        workflowId: task.workflowId,
        shareId: task.shareId,
    };
}

/**
 * 执行任务（供 SSE 端点调用）
 *
 * 流程：
 * 1. 从 DB 加载任务数据
 * 2. 注册 AbortController
 * 3. 路由到对应 handler
 * 4. 发送完成/失败通知
 * 5. 更新 DB 状态
 */
export async function executeTask(taskId: string): Promise<void> {
    await ensureHandlers();

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
        // 更新 DB 状态为 running
        const db = await getDb();
        await db
            .update(tasks)
            .set({ status: "processing" })
            .where(eq(tasks.id, taskId));

        notifyTask(taskId, TaskStatus.RUNNING, { message: "任务开始执行" }, taskData.nodeId);

        // 查找 handler
        const handler = getHandler(taskData.type, taskData.function);
        if (!handler) {
            throw new Error(
                `No handler for type=${taskData.type}, function=${taskData.function}`,
            );
        }

        // 执行
        const result = await handler(taskData, controller.signal);

        // 检查是否被取消
        if (controller.signal.aborted) {
            return; // 取消通知由 abortTask 发送
        }

        if (result == null || typeof result !== "object") {
            throw new Error("Handler returned no result");
        }

        // 发送完成通知
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
        console.error(`[TaskRunner] Task ${taskId} failed:`, errorMsg);

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
 * 执行工作流任务
 */
export async function executeWorkflowTask(
    taskId: string,
    workflowJson: string,
    inputs: Record<string, unknown>,
    featureMap: Record<string, { type: string; function: string }>,
): Promise<void> {
    await ensureHandlers();

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

        // 通知工作流开始
        notifyTask(taskId, WorkflowStatus.WORKFLOW_STARTED, {
            totalNodes: execNodes.length,
            levels: (workflow.executionLevels || []).length,
            nodes: nodesInfo,
        });

        // callApi 函数 — 供 workflow runner 调用执行子任务
        async function callApi(
            feature: string,
            params: Record<string, unknown>,
        ): Promise<Record<string, unknown>> {
            const featureInfo = featureMap[feature];
            if (!featureInfo) {
                throw new Error(
                    `Unknown feature: ${feature}, not found in featureMap`,
                );
            }

            const handler = getHandler(featureInfo.type, featureInfo.function);
            if (!handler) {
                throw new Error(
                    `No handler for type=${featureInfo.type}, function=${featureInfo.function}`,
                );
            }

            const subTaskData: TaskData = {
                taskId: `${taskId}_${Date.now().toString(36)}`,
                userId: "default-user",
                feature,
                type: featureInfo.type,
                function: featureInfo.function,
                prompt: params,
                nodeId: "",
            };

            const result = await handler(subTaskData, controller.signal);

            // LLM 返回 { result: "..." } → 转换为 { text: "..." }
            if (featureInfo.type === "llm" && result.result) {
                return { text: result.result };
            }
            return result;
        }

        // 按层级执行节点
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
                    // 解析节点参数 — 从上游输出或工作流输入中获取
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

        // 收集输出并通知
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
        console.error(`[Workflow] Task ${taskId} failed:`, errorMsg);

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

// ==================== 工具函数 ====================

/**
 * 解析节点参数：从上游节点输出和工作流输入中获取参数值
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
            // 从上游节点输出获取
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
