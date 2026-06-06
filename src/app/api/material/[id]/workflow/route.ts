import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { materials, tasks, workflows } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * GET /api/material/[id]/workflow
 * Trace workflow linked to a material (local)
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const materialId = parseInt(id, 10);

        if (Number.isNaN(materialId)) {
            return NextResponse.json(
                { error: "Invalid material ID" },
                { status: 400 },
            );
        }

        const db = await getDb();
        const material = await db.query.materials.findFirst({
            where: and(
                eq(materials.id, materialId),
                eq(materials.deleted, false),
            ),
        });

        if (!material) {
            return NextResponse.json(
                { error: "Material not found" },
                { status: 404 },
            );
        }

        if (!material.taskId) {
            return NextResponse.json({
                workflow: null,
                message: "Material is not linked to any task",
            });
        }

        const task = await db.query.tasks.findFirst({
            where: eq(tasks.id, material.taskId),
        });

        if (!task) {
            return NextResponse.json({
                workflow: null,
                message: "Associated task not found",
            });
        }

        if (!task.workflowId) {
            return NextResponse.json({
                workflow: null,
                message: "Task is not linked to any workflow",
            });
        }

        const workflow = await db.query.workflows.findFirst({
            where: and(
                eq(workflows.id, task.workflowId),
                eq(workflows.deleted, false),
            ),
        });

        if (!workflow) {
            return NextResponse.json({
                workflow: null,
                message: "Associated workflow not found or deleted",
            });
        }

        return NextResponse.json({
            workflow: {
                id: workflow.id,
                name: workflow.name,
                description: workflow.description,
                cover: workflow.cover,
            },
        });
    } catch (error) {
        logger.error("Error tracing material workflow:", error);

        return NextResponse.json(
            { error: "Failed to trace material workflow" },
            { status: 500 },
        );
    }
}
