import type { Edge, Node } from "@xyflow/react";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { workflows } from "@/db/schema";
import { logger } from "@/lib/logger";

type Params = Promise<{ id: string }>;

/**
 * GET /api/workspace/[id]
 */
export async function GET(_request: NextRequest, context: { params: Params }) {
    try {
        const { id } = await context.params;
        const workflowId = Number.parseInt(id, 10);

        if (Number.isNaN(workflowId)) {
            return NextResponse.json(
                { error: "Invalid workflow ID" },
                { status: 400 },
            );
        }

        const db = await getDb();
        const result = await db
            .select()
            .from(workflows)
            .where(
                and(eq(workflows.id, workflowId), eq(workflows.deleted, false)),
            )
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({
            workflow: result[0],
        });
    } catch (error) {
        logger.error("Error getting workflow:", error);

        return NextResponse.json(
            { error: "Failed to get workflow" },
            { status: 500 },
        );
    }
}

/**
 * PUT /api/workspace/[id]
 */
export async function PUT(request: NextRequest, context: { params: Params }) {
    try {
        const { id } = await context.params;
        const workflowId = Number.parseInt(id, 10);

        if (Number.isNaN(workflowId)) {
            return NextResponse.json(
                { error: "Invalid workflow ID" },
                { status: 400 },
            );
        }

        const body = (await request.json()) as {
            name?: string;
            description?: string;
            flow?: { nodes: Node[]; edges: Edge[] };
            executable?: Record<string, unknown>;
        };

        const updateData: {
            name?: string;
            description?: string | null;
            flow?: string;
            executable?: string | null;
        } = {};

        if (body.name !== undefined) {
            updateData.name = body.name;
        }
        if (body.description !== undefined) {
            updateData.description = body.description;
        }
        if (body.flow !== undefined) {
            updateData.flow = JSON.stringify(body.flow);
        }
        if (body.executable !== undefined) {
            updateData.executable = JSON.stringify(body.executable);
        }

        const db = await getDb();
        const result = await db
            .update(workflows)
            .set(updateData)
            .where(
                and(eq(workflows.id, workflowId), eq(workflows.deleted, false)),
            )
            .returning({ id: workflows.id });

        if (result.length === 0) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Error updating workflow:", error);

        return NextResponse.json(
            { error: "Failed to update workflow" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/workspace/[id]
 */
export async function DELETE(
    _request: NextRequest,
    context: { params: Params },
) {
    try {
        const { id } = await context.params;
        const workflowId = Number.parseInt(id, 10);

        if (Number.isNaN(workflowId)) {
            return NextResponse.json(
                { error: "Invalid workflow ID" },
                { status: 400 },
            );
        }

        const db = await getDb();
        const result = await db
            .update(workflows)
            .set({ deleted: true })
            .where(eq(workflows.id, workflowId))
            .returning({ id: workflows.id });

        if (result.length === 0) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Error deleting workflow:", error);

        return NextResponse.json(
            { error: "Failed to delete workflow" },
            { status: 500 },
        );
    }
}
