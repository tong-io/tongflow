/**
 * 任务完成处理服务
 *
 * 提供幂等的任务状态更新和素材保存功能
 * 被 webhook 和前端 SSE 双保险调用
 */

import { getDb } from "@/db";
import { tasks, materials, workflows } from "@/db/schema";
import { eq } from "drizzle-orm";

type MaterialType = "image" | "video" | "audio" | "text" | "file" | "model";

export interface TaskCompletionData {
    // 单任务格式
    file_key?: string;
    file_keys?: string[];
    text?: string;
    texts?: string[];
    feature?: string;
    error?: string;
    // 工作流格式
    outputs?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface TaskCompletionResult {
    success: boolean;
    taskUpdated: boolean;
    savedMaterials: number;
    error?: string;
}

/**
 * 映射 SSE/webhook 状态到数据库状态
 */
export function mapStatusToDbStatus(status: string): string {
    switch (status) {
        case "COMPLETED":
        case "WORKFLOW_COMPLETED":
            return "completed";
        case "FAILED":
        case "WORKFLOW_FAILED":
            return "failed";
        case "CANCELLED":
        case "WORKFLOW_CANCELLED":
            return "cancelled";
        case "RUNNING":
        case "WORKFLOW_STARTED":
            return "processing";
        default:
            return "pending";
    }
}

/**
 * 根据 fileKey 推断素材类型
 */
function inferMaterialType(fileKey: string): MaterialType {
    const ext = fileKey.split(".").pop()?.toLowerCase() || "";

    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) {
        return "image";
    }
    if (["mp4", "webm", "mov", "avi", "mkv", "flv", "wmv"].includes(ext)) {
        return "video";
    }
    if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)) {
        return "audio";
    }
    if (["glb", "gltf", "obj", "fbx", "stl"].includes(ext)) {
        return "model";
    }
    return "file";
}

/**
 * 生成素材名称
 */
function generateMaterialName(taskName: string, type: MaterialType): string {
    const now = new Date();
    const timestamp = `${
        now.getMonth() + 1
    }/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(
        2,
        "0",
    )}`;
    const typeLabel: Record<MaterialType, string> = {
        image: "图片",
        video: "视频",
        audio: "音频",
        text: "文本",
        file: "文件",
        model: "模型",
    };
    return `${taskName} - ${typeLabel[type]} (${timestamp})`;
}

/**
 * 从任务数据中提取文件和文本
 */
function extractOutputs(data: TaskCompletionData): {
    fileKeys: string[];
    texts: string[];
} {
    const fileKeys: string[] = [];
    const texts: string[] = [];

    // 单任务格式: { file_key, file_keys, text, texts }
    if (data.file_key) fileKeys.push(data.file_key);
    if (data.file_keys) fileKeys.push(...data.file_keys);
    if (data.text) texts.push(data.text);
    if (data.texts) texts.push(...data.texts);

    // 工作流格式: { outputs: { "nodeId": [...], ... } }
    if (data.outputs && typeof data.outputs === "object") {
        for (const value of Object.values(
            data.outputs as Record<string, unknown>,
        )) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (typeof item === "string") {
                        // 判断是文件还是文本（包含 / 或有扩展名的认为是文件）
                        const isFile =
                            item.includes("/") ||
                            (item.includes(".") &&
                                /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mp3|wav|glb|gltf|obj|pdf|doc|docx)$/i.test(
                                    item,
                                ));
                        if (isFile) {
                            fileKeys.push(item);
                        } else {
                            texts.push(item);
                        }
                    }
                }
            }
        }
    }

    return { fileKeys, texts };
}

export interface TaskCompletionOptions {
    source?: "webhook" | "frontend";
    /** 是否跳过保存素材（单任务不需要保存素材） */
    skipMaterialSave?: boolean;
}

/**
 * 幂等处理任务完成
 *
 * 1. 更新任务状态（幂等：只有非终态才更新）
 * 2. 保存素材（幂等：同一 taskId 只保存一次，可通过 skipMaterialSave 跳过）
 *
 * @param taskId 任务ID
 * @param status SSE/webhook 状态码
 * @param data 任务完成数据
 * @param options 选项
 */
export async function handleTaskCompletion(
    taskId: string,
    status: string,
    data: TaskCompletionData | null,
    options: TaskCompletionOptions = {},
): Promise<TaskCompletionResult> {
    const { source = "webhook", skipMaterialSave = false } = options;
    const logPrefix = `[${source === "webhook" ? "Webhook" : "Frontend"}]`;

    try {
        const db = await getDb();
        const dbStatus = mapStatusToDbStatus(status);

        // 1. 幂等更新任务状态：先查询当前状态
        const currentTask = await db
            .select({
                status: tasks.status,
                userId: tasks.userId,
                workflowId: tasks.workflowId,
                shareId: tasks.shareId,
                chargedAmount: tasks.chargedAmount,
            })
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);

        if (!currentTask.length) {
            console.error(`${logPrefix} Task ${taskId} not found`);
            return {
                success: false,
                taskUpdated: false,
                savedMaterials: 0,
                error: "Task not found",
            };
        }

        const {
            status: currentStatus,
            userId,
            workflowId,
            shareId,
            chargedAmount,
        } = currentTask[0];
        let taskUpdated = false;

        // 幂等：只有当前状态不是终态时才更新
        const terminalStatuses = ["completed", "failed", "cancelled"];
        if (!terminalStatuses.includes(currentStatus)) {
            const updateData: {
                status: string;
                result?: string;
                error?: string;
                progress?: number;
                chargedAmount?: number;
            } = { status: dbStatus };

            if (data) {
                if (data.error) {
                    updateData.error =
                        typeof data.error === "string"
                            ? data.error
                            : JSON.stringify(data.error);
                }
                const { error: _, ...resultData } = data;
                if (Object.keys(resultData).length > 0) {
                    updateData.result = JSON.stringify(resultData);
                }
            }

            if (dbStatus === "completed") {
                updateData.progress = 100;
            }

            await db.update(tasks).set(updateData).where(eq(tasks.id, taskId));
            taskUpdated = true;
            console.log(
                `${logPrefix} Task ${taskId} status updated to ${dbStatus}`,
            );
        } else {
            console.log(
                `${logPrefix} Task ${taskId} already in terminal state (${currentStatus}), skipping update`,
            );
        }

        // 2. 如果不是完成状态、没有数据、或跳过素材保存，直接返回
        if (dbStatus !== "completed" || !data || skipMaterialSave) {
            if (skipMaterialSave) {
                console.log(
                    `${logPrefix} Skipping material save for task ${taskId} (skipMaterialSave=true)`,
                );
            }
            return { success: true, taskUpdated, savedMaterials: 0 };
        }

        // 3. 幂等保存素材：检查是否已存在
        const existingMaterials = await db
            .select({ id: materials.id })
            .from(materials)
            .where(eq(materials.taskId, taskId))
            .limit(1);

        if (existingMaterials.length > 0) {
            console.log(
                `${logPrefix} Materials for task ${taskId} already exist, skipping (idempotent)`,
            );
            return { success: true, taskUpdated, savedMaterials: 0 };
        }

        // 4. 提取并保存素材
        const { fileKeys, texts } = extractOutputs(data);

        if (fileKeys.length === 0 && texts.length === 0) {
            console.log(`${logPrefix} No outputs to save for task ${taskId}`);
            return { success: true, taskUpdated, savedMaterials: 0 };
        }

        if (!userId) {
            console.error(`${logPrefix} Task ${taskId} has no userId`);
            return {
                success: true,
                taskUpdated,
                savedMaterials: 0,
                error: "No userId",
            };
        }

        const taskName = data.feature || "任务";
        const savedMaterialIds: number[] = [];

        // 保存文件类型素材
        for (const fileKey of fileKeys) {
            const type = inferMaterialType(fileKey);
            const materialName = generateMaterialName(taskName, type);

            const result = await db
                .insert(materials)
                .values({
                    userId,
                    taskId,
                    workflowId: workflowId ?? undefined, // 来源追溯
                    shareId: shareId ?? undefined, // 来源追溯
                    name: materialName,
                    type,
                    content: JSON.stringify({ fileKeys: [fileKey] }),
                    thumbnail:
                        type === "image" || type === "video"
                            ? fileKey
                            : undefined,
                })
                .returning({ id: materials.id });

            savedMaterialIds.push(result[0].id);
            console.log(
                `${logPrefix} Saved ${type}: ${fileKey} -> material ${result[0].id}`,
            );
        }

        // 保存文本类型素材
        if (texts.length > 0) {
            const materialName = generateMaterialName(taskName, "text");

            const result = await db
                .insert(materials)
                .values({
                    userId,
                    taskId,
                    workflowId: workflowId ?? undefined, // 来源追溯
                    shareId: shareId ?? undefined, // 来源追溯
                    name: materialName,
                    type: "text",
                    content: JSON.stringify({ texts }),
                })
                .returning({ id: materials.id });

            savedMaterialIds.push(result[0].id);
            console.log(
                `${logPrefix} Saved text (${texts.length} items) -> material ${result[0].id}`,
            );
        }

        // 5. 自动更新 workflow.cover 为最新产出（只有执行自己的 workflow 时才更新）
        if (workflowId) {
            const coverFileKey = fileKeys.find((key) => {
                const type = inferMaterialType(key);
                return type === "image" || type === "video";
            });

            if (coverFileKey) {
                await db
                    .update(workflows)
                    .set({ cover: coverFileKey })
                    .where(eq(workflows.id, workflowId));
                console.log(
                    `${logPrefix} Updated workflow ${workflowId} cover: ${coverFileKey}`,
                );
            }
        }

        console.log(
            `${logPrefix} Saved ${savedMaterialIds.length} materials for task ${taskId}`,
        );
        return {
            success: true,
            taskUpdated,
            savedMaterials: savedMaterialIds.length,
        };
    } catch (error) {
        console.error(`${logPrefix} Error processing task ${taskId}:`, error);
        return {
            success: false,
            taskUpdated: false,
            savedMaterials: 0,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
