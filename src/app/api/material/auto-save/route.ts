/**
 * POST /api/material/auto-save
 * Saves task outputs (webhook-authenticated internal API)
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { materials, tasks, workflows } from "@/db/schema";
import { logger } from "@/lib/logger";

const WEBHOOK_TOKEN = process.env.TASK_WEBHOOK_TOKEN;

type MaterialType = "image" | "video" | "audio" | "text" | "file" | "model";

interface AutoSaveRequest {
    taskId: string;
    taskName?: string;
    outputs: {
        fileKeys?: string[];
        texts?: string[];
    };
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

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get("x-token");
        if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
            logger.error("[AutoSave] Invalid token");
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const body = (await request.json()) as AutoSaveRequest;
        const { taskId, taskName, outputs } = body;

        if (!taskId) {
            return NextResponse.json(
                { error: "Missing taskId" },
                { status: 400 },
            );
        }

        if (!outputs || (!outputs.fileKeys?.length && !outputs.texts?.length)) {
            logger.debug("[AutoSave] No outputs to save");
            return NextResponse.json({ success: true, saved: 0 });
        }

        const db = await getDb();
        const task = await db
            .select({
                workflowId: tasks.workflowId,
            })
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);

        if (!task.length) {
            logger.error(`[AutoSave] Task ${taskId} not found`);
            return NextResponse.json(
                { error: "Task not found" },
                { status: 404 },
            );
        }

        const workflowId = task[0].workflowId;
        const name = taskName || "Task";

        logger.debug(`[AutoSave] Saving materials for task ${taskId}`);

        const savedMaterials: number[] = [];

        if (outputs.fileKeys && outputs.fileKeys.length > 0) {
            for (const fileKey of outputs.fileKeys) {
                const type = inferMaterialType(fileKey);
                const materialName = generateMaterialName(name, type);

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

                savedMaterials.push(result[0].id);
                logger.debug(
                    `[AutoSave] Saved ${type}: ${fileKey} -> material ${result[0].id}`,
                );
            }
        }

        if (outputs.texts && outputs.texts.length > 0) {
            const materialName = generateMaterialName(name, "text");

            const result = await db
                .insert(materials)
                .values({
                    taskId,
                    workflowId: workflowId ?? undefined,
                    name: materialName,
                    type: "text",
                    content: JSON.stringify({ texts: outputs.texts }),
                })
                .returning({ id: materials.id });

            savedMaterials.push(result[0].id);
            logger.debug(
                `[AutoSave] Saved text (${outputs.texts.length} items) -> material ${result[0].id}`,
            );
        }

        if (workflowId) {
            const coverFileKey = outputs.fileKeys?.find((key) => {
                const type = inferMaterialType(key);
                return type === "image" || type === "video";
            });

            if (coverFileKey) {
                await db
                    .update(workflows)
                    .set({ cover: coverFileKey })
                    .where(eq(workflows.id, workflowId));
                logger.debug(
                    `[AutoSave] Updated workflow ${workflowId} cover: ${coverFileKey}`,
                );
            }
        }

        logger.debug(
            `[AutoSave] Saved ${savedMaterials.length} materials for task ${taskId}`,
        );

        return NextResponse.json({
            success: true,
            saved: savedMaterials.length,
            materialIds: savedMaterials,
        });
    } catch (error) {
        logger.error("[AutoSave] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
