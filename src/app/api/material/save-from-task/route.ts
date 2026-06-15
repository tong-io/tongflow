/**
 * POST /api/material/save-from-task
 * Frontend backup: task completion + material save (idempotent)
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

interface SaveFromTaskRequest {
    taskId: string;
    status: string;
    data?: TaskCompletionData;
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as SaveFromTaskRequest;
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
            logger.debug(`[Frontend] Task ${taskId} not found, skipping`);
            return NextResponse.json({ success: true, skipped: true });
        }

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
        logger.error("[Frontend] Error:", error);
        return NextResponse.json({
            success: false,
            error: "Internal server error (webhook backup exists)",
        });
    }
}
