import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { workflows, tasks, materials } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";

/**
 * GET /api/workflow/[id]/materials
 * 获取工作流产出的素材列表（用于选择代表作）
 * Query params: type - 筛选素材类型（默认 image）
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        // 1. 认证检查
        const user = await requireAuth();
        const { id } = await params;
        const workflowId = parseInt(id, 10);

        if (isNaN(workflowId)) {
            return NextResponse.json(
                { error: "Invalid workflow ID" },
                { status: 400 },
            );
        }

        // 2. 获取查询参数
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") || "image";

        // 3. 验证工作流所有权
        const db = await getDb();
        const workflow = await db.query.workflows.findFirst({
            where: and(
                eq(workflows.id, workflowId),
                eq(workflows.userId, user.id),
                eq(workflows.deleted, false),
            ),
        });

        if (!workflow) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 },
            );
        }

        // 4. 获取该工作流执行的所有任务ID（只查自己执行的）
        const workflowTasks = await db
            .select({ id: tasks.id })
            .from(tasks)
            .where(
                and(
                    eq(tasks.workflowId, workflowId),
                    eq(tasks.userId, user.id), // 只查自己执行的任务
                ),
            );

        if (workflowTasks.length === 0) {
            return NextResponse.json({ materials: [] });
        }

        const taskIds = workflowTasks.map((t) => t.id);

        // 5. 获取这些任务产出的素材
        const materialList = await db
            .select()
            .from(materials)
            .where(
                and(
                    eq(materials.userId, user.id),
                    eq(materials.deleted, false),
                    eq(materials.type, type),
                    inArray(materials.taskId, taskIds),
                ),
            )
            .orderBy(desc(materials.createdAt));

        return NextResponse.json({
            materials: materialList.map((m) => ({
                ...m,
                content: JSON.parse(m.content),
            })),
        });
    } catch (error) {
        console.error("Error fetching workflow materials:", error);

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
            { error: "Failed to fetch workflow materials" },
            { status: 500 },
        );
    }
}
