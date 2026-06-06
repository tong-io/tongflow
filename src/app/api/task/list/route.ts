import { desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { logger } from "@/lib/logger";
import { safeJsonParse } from "@/utils/json-utils";

/**
 * GET /api/task/list
 */
export async function GET(request: NextRequest) {
    try {
        const page = parseInt(
            request.nextUrl.searchParams.get("page") || "1",
            10,
        );
        const pageSize = parseInt(
            request.nextUrl.searchParams.get("pageSize") || "20",
            10,
        );
        const offset = (page - 1) * pageSize;

        const db = await getDb();
        const result = await db
            .select()
            .from(tasks)
            .orderBy(desc(tasks.createdAt))
            .limit(pageSize)
            .offset(offset);

        const taskList = result.map((task) => ({
            ...task,
            prompt: safeJsonParse(task.prompt, {}),
            result: safeJsonParse(task.result, null),
        }));

        return NextResponse.json({ tasks: taskList });
    } catch (error) {
        logger.error("Error getting task list:", error);

        return NextResponse.json(
            { error: "Failed to get task list" },
            { status: 500 },
        );
    }
}
