import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { TaskStatus } from "@/constants/task-status";
import { getDb, tasks } from "@/db";
import { logger } from "@/lib/logger";
import { abortTask, notifyTask } from "@/lib/task/emitter";

/**
 * POST /api/task/stop
 * Cancel a running task
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

        logger.debug(`[Stop] Received stop request: ${taskId}`);

        // 1. Abort the task (via AbortController)
        const aborted = abortTask(taskId);

        // 2. Notify the frontend that the task has been cancelled
        notifyTask(taskId, TaskStatus.CANCELLED, { message: "Task cancelled" });

        // 3. Update database status
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
        logger.error("[Stop] Error:", error);
        return NextResponse.json(
            { error: "Failed to stop task" },
            { status: 500 },
        );
    }
}
