import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { materials, tasks, workflows, shares } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/material/[id]/workflow
 * 从作品追溯关联的工作流信息
 * 返回：
 * - 如果是私有工作流产出：返回 workflow 信息
 * - 如果是分享工作流产出：返回 share 信息
 * - 如果无法追溯：返回 null
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        // 1. 认证检查
        const user = await requireAuth();
        const { id } = await params;
        const materialId = parseInt(id, 10);

        if (isNaN(materialId)) {
            return NextResponse.json(
                { error: "Invalid material ID" },
                { status: 400 },
            );
        }

        // 2. 获取素材
        const db = await getDb();
        const material = await db.query.materials.findFirst({
            where: and(
                eq(materials.id, materialId),
                eq(materials.userId, user.id),
                eq(materials.deleted, false),
            ),
        });

        if (!material) {
            return NextResponse.json(
                { error: "Material not found" },
                { status: 404 },
            );
        }

        // 3. 检查是否有关联的任务
        if (!material.taskId) {
            return NextResponse.json({
                workflow: null,
                share: null,
                message: "Material is not linked to any task",
            });
        }

        // 4. 获取关联的任务
        const task = await db.query.tasks.findFirst({
            where: eq(tasks.id, material.taskId),
        });

        if (!task) {
            return NextResponse.json({
                workflow: null,
                share: null,
                message: "Associated task not found",
            });
        }

        // 5. 根据 workflowId/shareId 追溯到对应的来源
        // 新设计：task 有 workflowId 或 shareId 字段，二选一

        if (task.shareId) {
            // 关联的是分享的工作流
            const share = await db.query.shares.findFirst({
                where: and(
                    eq(shares.id, task.shareId),
                    eq(shares.deleted, false),
                ),
            });

            if (!share) {
                return NextResponse.json({
                    workflow: null,
                    share: null,
                    message: "Associated share not found or deleted",
                });
            }

            // 如果是别人的 Share，也返回信息（用于 Remix 场景）
            return NextResponse.json({
                workflow: null,
                share: {
                    id: share.id,
                    name: share.name,
                    description: share.description,
                    cover: share.cover,
                    userId: share.userId,
                    workflowId: share.workflowId,
                    version: share.version,
                    isOwner: share.userId === user.id,
                },
                source: "share",
            });
        } else if (task.workflowId) {
            // 关联的是私有工作流
            const workflow = await db.query.workflows.findFirst({
                where: and(
                    eq(workflows.id, task.workflowId),
                    eq(workflows.deleted, false),
                ),
            });

            if (!workflow) {
                return NextResponse.json({
                    workflow: null,
                    share: null,
                    message: "Associated workflow not found or deleted",
                });
            }

            // 只有工作流所有者才能看到完整信息
            if (workflow.userId !== user.id) {
                return NextResponse.json({
                    workflow: null,
                    share: null,
                    message:
                        "You don't have permission to access this workflow",
                });
            }

            return NextResponse.json({
                workflow: {
                    id: workflow.id,
                    name: workflow.name,
                    description: workflow.description,
                    cover: workflow.cover,
                    currentShareId: workflow.currentShareId,
                    isPublished: !!workflow.currentShareId,
                },
                share: null,
                source: "workflow",
            });
        } else {
            // 任务没有关联任何工作流或分享
            return NextResponse.json({
                workflow: null,
                share: null,
                message: "Task is not linked to any workflow or share",
            });
        }
    } catch (error) {
        console.error("Error tracing material workflow:", error);

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
            { error: "Failed to trace material workflow" },
            { status: 500 },
        );
    }
}
