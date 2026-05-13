/**
 * POST /api/task/update-status
 * Frontend backup: task status only (no material save)
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { logger } from "@/lib/logger";
import {
    handleTaskCompletion,
    type TaskCompletionData,
} from "@/lib/task/completion";

interface UpdateStatusRequest {
    taskId: string;
    status: string;
    data?: TaskCompletionData;
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as UpdateStatusRequest;
        const { taskId, status, data } = body;

        if (!taskId || !status) {
            return NextResponse.json(
                { error: "Missing taskId or status" },
                { status: 400 },
            );
        }

        const db = await getDb();
        const task = await db
            .select({ id: tasks.id })
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);

        if (!task.length) {
            logger.debug(`[UpdateStatus] Task ${taskId} not found, skipping`);
            return NextResponse.json({ success: true, skipped: true });
        }

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
        logger.error("[UpdateStatus] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
