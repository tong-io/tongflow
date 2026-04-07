/**
 * POST /api/task/update-status
 * 前端专用 API：仅更新单任务状态（不保存素材）
 *
 * 当前端通过 SSE 收到单任务完成/失败/取消消息时调用
 * 作为 webhook 的双保险机制
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

interface UpdateStatusRequest {
    taskId: string;
    status: string; // SSE 状态码，如 "COMPLETED", "FAILED"
    data?: TaskCompletionData;
}

export async function POST(request: NextRequest) {
    try {
        // 1. 验证用户身份
        const user = await getCurrentUser();
        if (!user) {
            console.log(
                "[UpdateStatus] User not authenticated, skipping (webhook backup exists)",
            );
            return NextResponse.json({ success: true, skipped: true });
        }

        // 2. 解析请求体
        const body = (await request.json()) as UpdateStatusRequest;
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
            console.log(`[UpdateStatus] Task ${taskId} not found, skipping`);
            return NextResponse.json({ success: true, skipped: true });
        }

        if (task[0].userId !== user.id) {
            console.log(
                `[UpdateStatus] Task ${taskId} does not belong to user ${user.id}, skipping`,
            );
            return NextResponse.json({ success: true, skipped: true });
        }

        // 4. 调用共享服务处理任务（幂等，跳过素材保存）
        const result = await handleTaskCompletion(
            taskId,
            status,
            data ?? null,
            {
                source: "frontend",
                skipMaterialSave: true,
            },
        );

        return NextResponse.json({
            success: result.success,
            taskUpdated: result.taskUpdated,
        });
    } catch (error) {
        console.error("[UpdateStatus] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
