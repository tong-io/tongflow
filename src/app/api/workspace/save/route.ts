import type { Edge, Node } from "@xyflow/react";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { workflows } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * POST /api/workspace/save
 * Save a workflow
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {
            workflowId?: number;
            name: string;
            description?: string;
            flow: { nodes: Node[]; edges: Edge[] };
            executable?: Record<string, unknown>;
        };
        const { workflowId, name, description, flow, executable } = body;

        if (!name || typeof name !== "string") {
            return NextResponse.json(
                { error: "Name is required" },
                { status: 400 },
            );
        }

        if (!flow || !flow.nodes || !flow.edges) {
            return NextResponse.json(
                { error: "Flow data is required" },
                { status: 400 },
            );
        }

        const db = await getDb();

        let resultId: number;

        if (workflowId) {
            const existing = await db
                .select({ id: workflows.id })
                .from(workflows)
                .where(
                    and(
                        eq(workflows.id, workflowId),
                        eq(workflows.deleted, false),
                    ),
                )
                .limit(1);

            if (existing.length === 0) {
                return NextResponse.json(
                    { error: "Workflow not found" },
                    { status: 404 },
                );
            }

            await db
                .update(workflows)
                .set({
                    name,
                    description: description || null,
                    flow: JSON.stringify(flow),
                    executable: executable ? JSON.stringify(executable) : null,
                    updatedAt: new Date(),
                })
                .where(eq(workflows.id, workflowId));

            resultId = workflowId;
        } else {
            const result = await db
                .insert(workflows)
                .values({
                    name,
                    description: description || null,
                    flow: JSON.stringify(flow),
                    executable: executable ? JSON.stringify(executable) : null,
                })
                .returning({ id: workflows.id });

            resultId = result[0].id;
        }

        return NextResponse.json({
            workflowId: resultId,
        });
    } catch (error) {
        logger.error("Error saving workflow:", error);

        return NextResponse.json(
            { error: "Failed to save workflow" },
            { status: 500 },
        );
    }
}
