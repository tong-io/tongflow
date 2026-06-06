/**
 * POST /api/task/webhook
 * Task status update Webhook
 *
 * Called back by OpenAPI when a task status changes (completed/failed/cancelled)
 * Idempotent handling: update task status + save materials
 */

import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
    handleTaskCompletion,
    type TaskCompletionData,
} from "@/lib/task/completion";

// Webhook Token validation
const WEBHOOK_TOKEN = process.env.TASK_WEBHOOK_TOKEN;

interface WebhookPayload {
    taskId: string;
    status: string;
    data?: TaskCompletionData;
}

export async function POST(request: NextRequest) {
    try {
        // 1. Validate Token
        const token = request.headers.get("x-token");
        if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
            logger.error("[Webhook] Invalid token");
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        // 2. Parse request body
        const body = (await request.json()) as WebhookPayload;
        const { taskId, status, data } = body;

        if (!taskId || !status) {
            return NextResponse.json(
                { error: "Missing taskId or status" },
                { status: 400 },
            );
        }

        // 3. Idempotently handle task completion
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
        logger.error("[Webhook] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
