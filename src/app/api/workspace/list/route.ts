import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { workflows } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * GET /api/workspace/list
 * Workflow list (local)
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1", 10);
        const limit = parseInt(searchParams.get("limit") || "10", 10);
        const offset = (page - 1) * limit;

        const db = await getDb();

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(workflows)
            .where(eq(workflows.deleted, false));
        const total = Number(countResult[0]?.count || 0);

        const workflowList = await db
            .select()
            .from(workflows)
            .where(eq(workflows.deleted, false))
            .orderBy(desc(workflows.updatedAt))
            .limit(limit)
            .offset(offset);

        return NextResponse.json({
            workflows: workflowList,
            pagination: {
                page,
                limit,
                total,
                hasMore: offset + workflowList.length < total,
            },
        });
    } catch (error) {
        logger.error("Error listing workflows:", error);

        return NextResponse.json(
            { error: "Failed to list workflows" },
            { status: 500 },
        );
    }
}
