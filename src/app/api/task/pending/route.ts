/**
 * GET /api/task/pending
 * Latest pending workflow task (local single-user)
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { logger } from "@/lib/logger";

export async function GET() {
    try {
        const db = await getDb();
        const result = await db
            .select()
            .from(tasks)
            .where(
                and(
                    eq(tasks.feature, "workflow"),
                    inArray(tasks.status, ["pending", "processing"]),
                ),
            )
            .orderBy(desc(tasks.createdAt))
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json({ task: null });
        }

        const task = result[0];

        return NextResponse.json({
            task: {
                id: task.id,
                status: task.status,
                progress: task.progress,
                createdAt: task.createdAt,
            },
        });
    } catch (error) {
        logger.error("[API /api/task/pending] Error:", error);
        return NextResponse.json({ task: null });
    }
}
