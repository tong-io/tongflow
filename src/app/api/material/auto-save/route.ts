/**
 * POST /api/material/auto-save
 * 内部 API：任务执行完成后自动保存结果到素材库
 *
 * 由 openapi 在任务/工作流完成时调用，使用 TASK_WEBHOOK_TOKEN 验证
 * 通过 taskId 从 tasks 表查询 userId，无需单独传递
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { materials, tasks, workflows } from "@/db/schema";
import { eq } from "drizzle-orm";

// 复用 webhook token 验证
const WEBHOOK_TOKEN = process.env.TASK_WEBHOOK_TOKEN;

type MaterialType = "image" | "video" | "audio" | "text" | "file" | "model";

interface AutoSaveRequest {
    taskId: string;
    taskName?: string; // 可选的任务/工作流名称
    outputs: {
        fileKeys?: string[];
        texts?: string[];
    };
}

/**
 * 根据 fileKey 推断素材类型
 */
function inferMaterialType(fileKey: string): MaterialType {
    const ext = fileKey.split(".").pop()?.toLowerCase() || "";

    // 图片格式
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) {
        return "image";
    }

    // 视频格式
    if (["mp4", "webm", "mov", "avi", "mkv", "flv", "wmv"].includes(ext)) {
        return "video";
    }

    // 音频格式
    if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)) {
        return "audio";
    }

    // 3D 模型格式
    if (["glb", "gltf", "obj", "fbx", "stl"].includes(ext)) {
        return "model";
    }

    // 其他文件
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

export async function POST(request: NextRequest) {
    try {
        // 1. 验证 Token
        const token = request.headers.get("x-token");
        if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
            console.error("[AutoSave] Invalid token");
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        // 2. 解析请求体
        const body = (await request.json()) as AutoSaveRequest;
        const { taskId, taskName, outputs } = body;

        if (!taskId) {
            return NextResponse.json(
                { error: "Missing taskId" },
                { status: 400 },
            );
        }

        if (!outputs || (!outputs.fileKeys?.length && !outputs.texts?.length)) {
            console.log("[AutoSave] No outputs to save");
            return NextResponse.json({ success: true, saved: 0 });
        }

        // 3. 从 tasks 表查询 userId 和 workflowId/shareId（关联的来源）
        const db = await getDb();
        const task = await db
            .select({
                userId: tasks.userId,
                workflowId: tasks.workflowId,
                shareId: tasks.shareId,
            })
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);

        if (!task.length || !task[0].userId) {
            console.error(`[AutoSave] Task ${taskId} not found or no userId`);
            return NextResponse.json(
                { error: "Task not found" },
                { status: 404 },
            );
        }

        const userId = task[0].userId;
        const workflowId = task[0].workflowId; // 执行自己 workflow 时有值
        const shareId = task[0].shareId; // 执行别人 share 时有值
        const name = taskName || "任务";

        console.log(
            `[AutoSave] Saving materials for task ${taskId}, user ${userId}`,
        );

        const savedMaterials: number[] = [];

        // 4. 保存文件类型素材
        if (outputs.fileKeys && outputs.fileKeys.length > 0) {
            for (const fileKey of outputs.fileKeys) {
                const type = inferMaterialType(fileKey);
                const materialName = generateMaterialName(name, type);

                const result = await db
                    .insert(materials)
                    .values({
                        userId,
                        taskId, // 关联任务ID，用于追溯素材来源
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

                savedMaterials.push(result[0].id);
                console.log(
                    `[AutoSave] Saved ${type}: ${fileKey} -> material ${result[0].id}`,
                );
            }
        }

        // 5. 保存文本类型素材
        if (outputs.texts && outputs.texts.length > 0) {
            const materialName = generateMaterialName(name, "text");

            const result = await db
                .insert(materials)
                .values({
                    userId,
                    taskId, // 关联任务ID，用于追溯素材来源
                    workflowId: workflowId ?? undefined, // 来源追溯
                    shareId: shareId ?? undefined, // 来源追溯
                    name: materialName,
                    type: "text",
                    content: JSON.stringify({ texts: outputs.texts }),
                })
                .returning({ id: materials.id });

            savedMaterials.push(result[0].id);
            console.log(
                `[AutoSave] Saved text (${outputs.texts.length} items) -> material ${result[0].id}`,
            );
        }

        // 6. 自动更新 workflow.cover 为最新产出（只有执行自己的 workflow 时才更新）
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
                console.log(
                    `[AutoSave] Updated workflow ${workflowId} cover: ${coverFileKey}`,
                );
            }
        }

        console.log(
            `[AutoSave] Saved ${savedMaterials.length} materials for task ${taskId}`,
        );

        return NextResponse.json({
            success: true,
            saved: savedMaterials.length,
            materialIds: savedMaterials,
        });
    } catch (error) {
        console.error("[AutoSave] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
