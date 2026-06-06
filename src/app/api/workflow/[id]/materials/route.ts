import { and, desc, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { materials, tasks, workflows } from "@/db/schema";
import { logger } from "@/lib/logger";
import { safeJsonParse } from "@/utils/json-utils";

/**
 * GET /api/workflow/[id]/materials
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const workflowId = parseInt(id, 10);

        if (Number.isNaN(workflowId)) {
            return NextResponse.json(
                { error: "Invalid workflow ID" },
                { status: 400 },
            );
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") || "image";

        const db = await getDb();
        const workflow = await db.query.workflows.findFirst({
            where: and(
                eq(workflows.id, workflowId),
                eq(workflows.deleted, false),
            ),
        });

        if (!workflow) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 },
            );
        }

        const workflowTasks = await db
            .select({ id: tasks.id })
            .from(tasks)
            .where(eq(tasks.workflowId, workflowId));

        if (workflowTasks.length === 0) {
            return NextResponse.json({ materials: [] });
        }

        const taskIds = workflowTasks.map((t) => t.id);

        const materialList = await db
            .select()
            .from(materials)
            .where(
                and(
                    eq(materials.deleted, false),
                    eq(materials.type, type),
                    inArray(materials.taskId, taskIds),
                ),
            )
            .orderBy(desc(materials.createdAt));

        return NextResponse.json({
            materials: materialList.map((m) => ({
                ...m,
                content: safeJsonParse(m.content, {}),
            })),
        });
    } catch (error) {
        logger.error("Error fetching workflow materials:", error);

        return NextResponse.json(
            { error: "Failed to fetch workflow materials" },
            { status: 500 },
        );
    }
}
