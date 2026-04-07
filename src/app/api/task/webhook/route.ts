/**
 * POST /api/task/webhook
 * 任务状态更新 Webhook
 *
 * OpenAPI 在任务状态变化（完成/失败/取消）时回调此接口
 * 幂等处理：更新任务状态 + 保存素材
 */

import { NextRequest, NextResponse } from "next/server";
import {
    handleTaskCompletion,
    type TaskCompletionData,
} from "@/services/task-completion";

// Webhook Token 验证
const WEBHOOK_TOKEN = process.env.TASK_WEBHOOK_TOKEN;

interface WebhookPayload {
    taskId: string;
    status: string;
    data?: TaskCompletionData;
}

export async function POST(request: NextRequest) {
    try {
        // 1. 验证 Token
        const token = request.headers.get("x-token");
        if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
            console.error("[Webhook] Invalid token");
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        // 2. 解析请求体
        const body = (await request.json()) as WebhookPayload;
        const { taskId, status, data } = body;

        if (!taskId || !status) {
            return NextResponse.json(
                { error: "Missing taskId or status" },
                { status: 400 },
            );
        }

        // 3. 幂等处理任务完成
        const result = await handleTaskCompletion(
            taskId,
            status,
            data ?? null,
            {
                source: "webhook",
            },
        );

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "Failed to process task" },
                { status: result.error === "Task not found" ? 404 : 500 },
            );
        }

        return NextResponse.json({
            success: true,
            taskUpdated: result.taskUpdated,
            savedMaterials: result.savedMaterials,
        });
    } catch (error) {
        console.error("[Webhook] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
