import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/task/list
 * 获取用户的任务列表
 */
export async function GET(request: NextRequest) {
    try {
        // 1. 认证检查
        const user = await requireAuth();

        // 2. 获取分页参数
        const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
        const pageSize = parseInt(
            request.nextUrl.searchParams.get("pageSize") || "20",
        );
        const offset = (page - 1) * pageSize;

        // 3. 从数据库查询
        const db = await getDb();
        const result = await db
            .select()
            .from(tasks)
            .where(eq(tasks.userId, user.id))
            .orderBy(desc(tasks.createdAt))
            .limit(pageSize)
            .offset(offset);

        // 4. 解析 JSON 字段并返回
        const taskList = result.map((task) => ({
            ...task,
            prompt: JSON.parse(task.prompt),
            result: task.result ? JSON.parse(task.result) : null,
        }));

        // 5. 返回结果
        return NextResponse.json({ tasks: taskList });
    } catch (error) {
        console.error("Error getting task list:", error);

        if (
            error instanceof Error &&
            error.message === "Authentication required"
        ) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        return NextResponse.json(
            { error: "Failed to get task list" },
            { status: 500 },
        );
    }
}
