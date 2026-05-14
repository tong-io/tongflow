/**
 * Idempotent task completion and material save (webhook + frontend)
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { materials, tasks, workflows } from "@/db/schema";
import { logger } from "@/lib/logger";

type MaterialType = "image" | "video" | "audio" | "text" | "file" | "model";

export interface TaskCompletionData {
    file_key?: string;
    file_keys?: string[];
    text?: string;
    texts?: string[];
    feature?: string;
    error?: string;
    outputs?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface TaskCompletionResult {
    success: boolean;
    taskUpdated: boolean;
    savedMaterials: number;
    error?: string;
}

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

function generateMaterialName(taskName: string, type: MaterialType): string {
    const now = new Date();
    const timestamp = `${
        now.getMonth() + 1
    }/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(
        2,
        "0",
    )}`;
    const typeLabel: Record<MaterialType, string> = {
        image: "Image",
        video: "Video",
        audio: "Audio",
        text: "Text",
        file: "File",
        model: "Model",
    };
    return `${taskName} - ${typeLabel[type]} (${timestamp})`;
}

function extractOutputs(data: TaskCompletionData): {
    fileKeys: string[];
    texts: string[];
} {
    const fileKeys: string[] = [];
    const texts: string[] = [];

    if (data.file_key) fileKeys.push(data.file_key);
    if (data.file_keys) fileKeys.push(...data.file_keys);
    if (data.text) texts.push(data.text);
    if (data.texts) texts.push(...data.texts);

    if (data.outputs && typeof data.outputs === "object") {
        for (const value of Object.values(
            data.outputs as Record<string, unknown>,
        )) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (typeof item === "string") {
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
    skipMaterialSave?: boolean;
}

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

        const currentTask = await db
            .select({
                status: tasks.status,
                workflowId: tasks.workflowId,
            })
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);

        if (!currentTask.length) {
            logger.error(`${logPrefix} Task ${taskId} not found`);
            return {
                success: false,
                taskUpdated: false,
                savedMaterials: 0,
                error: "Task not found",
            };
        }

        const { status: currentStatus, workflowId } = currentTask[0];
        let taskUpdated = false;

        const terminalStatuses = ["completed", "failed", "cancelled"];
        if (!terminalStatuses.includes(currentStatus)) {
            const updateData: {
                status: string;
                result?: string;
                error?: string;
                progress?: number;
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
            logger.debug(
                `${logPrefix} Task ${taskId} status updated to ${dbStatus}`,
            );
        } else {
            logger.debug(
                `${logPrefix} Task ${taskId} already in terminal state (${currentStatus}), skipping update`,
            );
        }

        if (dbStatus !== "completed" || !data || skipMaterialSave) {
            if (skipMaterialSave) {
                logger.debug(
                    `${logPrefix} Skipping material save for task ${taskId} (skipMaterialSave=true)`,
                );
            }
            return { success: true, taskUpdated, savedMaterials: 0 };
        }

        const existingMaterials = await db
            .select({ id: materials.id })
            .from(materials)
            .where(eq(materials.taskId, taskId))
            .limit(1);

        if (existingMaterials.length > 0) {
            logger.debug(
                `${logPrefix} Materials for task ${taskId} already exist, skipping (idempotent)`,
            );
            return { success: true, taskUpdated, savedMaterials: 0 };
        }

        const { fileKeys, texts } = extractOutputs(data);

        if (fileKeys.length === 0 && texts.length === 0) {
            logger.debug(`${logPrefix} No outputs to save for task ${taskId}`);
            return { success: true, taskUpdated, savedMaterials: 0 };
        }

        const taskName = data.feature || "Task";
        const savedMaterialIds: number[] = [];

        for (const fileKey of fileKeys) {
            const type = inferMaterialType(fileKey);
            const materialName = generateMaterialName(taskName, type);

            const result = await db
                .insert(materials)
                .values({
                    taskId,
                    workflowId: workflowId ?? undefined,
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
            logger.debug(
                `${logPrefix} Saved ${type}: ${fileKey} -> material ${result[0].id}`,
            );
        }

        if (texts.length > 0) {
            const materialName = generateMaterialName(taskName, "text");

            const result = await db
                .insert(materials)
                .values({
                    taskId,
                    workflowId: workflowId ?? undefined,
                    name: materialName,
                    type: "text",
                    content: JSON.stringify({ texts }),
                })
                .returning({ id: materials.id });

            savedMaterialIds.push(result[0].id);
            logger.debug(
                `${logPrefix} Saved text (${texts.length} items) -> material ${result[0].id}`,
            );
        }

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
                logger.debug(
                    `${logPrefix} Updated workflow ${workflowId} cover: ${coverFileKey}`,
                );
            }
        }

        logger.debug(
            `${logPrefix} Saved ${savedMaterialIds.length} materials for task ${taskId}`,
        );
        return {
            success: true,
            taskUpdated,
            savedMaterials: savedMaterialIds.length,
        };
    } catch (error) {
        logger.error(`${logPrefix} Error processing task ${taskId}:`, error);
        return {
            success: false,
            taskUpdated: false,
            savedMaterials: 0,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
