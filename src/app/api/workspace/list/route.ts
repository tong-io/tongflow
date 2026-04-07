import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { workflows } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * GET /api/workspace/list
 * 获取用户的工作流列表（支持分页）
 * 使用 cover 字段作为预览图
 */
export async function GET(request: Request) {
    try {
        // 1. 认证检查
        const user = await requireAuth();

        // 2. 解析分页参数
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1", 10);
        const limit = parseInt(searchParams.get("limit") || "10", 10);
        const offset = (page - 1) * limit;

        // 3. 从数据库查询
        const db = await getDb();

        // 查询总数
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(workflows)
            .where(
                and(
                    eq(workflows.userId, user.id),
                    eq(workflows.deleted, false),
                ),
            );
        const total = Number(countResult[0]?.count || 0);

        // 查询分页数据（直接包含 cover 字段）
        const workflowList = await db
            .select()
            .from(workflows)
            .where(
                and(
                    eq(workflows.userId, user.id),
                    eq(workflows.deleted, false),
                ),
            )
            .orderBy(desc(workflows.updatedAt))
            .limit(limit)
            .offset(offset);

        // 4. 返回结果
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
        console.error("Error listing workflows:", error);

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
            { error: "Failed to list workflows" },
            { status: 500 },
        );
    }
}
