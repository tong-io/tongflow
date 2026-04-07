/**
 * POST /api/material/save-from-task
 * 前端专用 API：更新任务状态 + 保存素材（双保险机制）
 *
 * 当前端通过 SSE 收到任务完成消息时调用
 * 使用用户认证（session）验证
 * 复用 task-completion 服务，实现幂等性
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
    handleTaskCompletion,
    type TaskCompletionData,
} from "@/services/task-completion";

interface SaveFromTaskRequest {
    taskId: string;
    status: string; // SSE 状态码，如 "COMPLETED", "FAILED"
    data?: TaskCompletionData;
}

export async function POST(request: NextRequest) {
    try {
        // 1. 验证用户身份（使用 session 认证）
        const user = await getCurrentUser();
        if (!user) {
            // 未登录时静默返回成功，因为 openapi 端会处理
            console.log(
                "[Frontend] User not authenticated, skipping (webhook backup exists)",
            );
            return NextResponse.json({ success: true, skipped: true });
        }

        // 2. 解析请求体
        const body = (await request.json()) as SaveFromTaskRequest;
        const { taskId, status, data } = body;

        if (!taskId || !status) {
            return NextResponse.json(
                { error: "Missing taskId or status" },
                { status: 400 },
            );
        }

        // 3. 验证任务属于当前用户
        const db = await getDb();
        const task = await db
            .select({ userId: tasks.userId })
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);

        if (!task.length) {
            console.log(`[Frontend] Task ${taskId} not found, skipping`);
            return NextResponse.json({ success: true, skipped: true });
        }

        if (task[0].userId !== user.id) {
            console.log(
                `[Frontend] Task ${taskId} does not belong to user ${user.id}, skipping`,
            );
            return NextResponse.json({ success: true, skipped: true });
        }

        // 4. 调用共享服务处理任务完成（幂等）
        const result = await handleTaskCompletion(
            taskId,
            status,
            data ?? null,
            {
                source: "frontend",
            },
        );

        return NextResponse.json({
            success: result.success,
            taskUpdated: result.taskUpdated,
            savedMaterials: result.savedMaterials,
            error: result.error,
        });
    } catch (error) {
        console.error("[Frontend] Error:", error);
        // 静默失败，因为 webhook 会处理
        return NextResponse.json({
            success: false,
            error: "Internal server error (webhook backup exists)",
        });
    }
}
