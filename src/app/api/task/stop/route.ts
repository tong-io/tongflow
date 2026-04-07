import { NextRequest, NextResponse } from "next/server";
import { abortTask, notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";
import { getDb, tasks } from "@/db";
import { eq } from "drizzle-orm";

/**
 * POST /api/task/stop
 * 取消正在执行的任务
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as { taskId: string };
        const { taskId } = body;

        if (!taskId) {
            return NextResponse.json(
                { error: "taskId is required" },
                { status: 400 },
            );
        }

        console.log(`[Stop] Received stop request: ${taskId}`);

        // 1. 取消任务（通过 AbortController）
        const aborted = abortTask(taskId);

        // 2. 通知前端任务已取消
        notifyTask(taskId, TaskStatus.CANCELLED, { message: "任务已取消" });

        // 3. 更新数据库状态
        const db = await getDb();
        await db
            .update(tasks)
            .set({ status: "cancelled" })
            .where(eq(tasks.id, taskId));

        return NextResponse.json({
            status: "cancelled",
            wasRunning: aborted,
        });
    } catch (error) {
        console.error("[Stop] Error:", error);
        return NextResponse.json(
            { error: "Failed to stop task" },
            { status: 500 },
        );
    }
}
