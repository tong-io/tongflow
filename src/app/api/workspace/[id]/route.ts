import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { workflows } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { Node, Edge } from "@xyflow/react";

type Params = Promise<{ id: string }>;

/**
 * GET /api/workspace/[id]
 * 获取单个工作流
 */
export async function GET(request: NextRequest, context: { params: Params }) {
    try {
        // 1. 认证检查
        const user = await requireAuth();

        // 2. 获取参数
        const { id } = await context.params;
        const workflowId = Number.parseInt(id);

        if (Number.isNaN(workflowId)) {
            return NextResponse.json(
                { error: "Invalid workflow ID" },
                { status: 400 },
            );
        }

        // 3. 从数据库查询
        const db = await getDb();
        const result = await db
            .select()
            .from(workflows)
            .where(
                and(
                    eq(workflows.id, workflowId),
                    eq(workflows.userId, user.id),
                    eq(workflows.deleted, false),
                ),
            )
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 },
            );
        }

        // 4. 返回结果
        return NextResponse.json({
            workflow: result[0],
        });
    } catch (error) {
        console.error("Error getting workflow:", error);

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
            { error: "Failed to get workflow" },
            { status: 500 },
        );
    }
}

/**
 * PUT /api/workspace/[id]
 * 更新工作流
 */
export async function PUT(request: NextRequest, context: { params: Params }) {
    try {
        // 1. 认证检查
        const user = await requireAuth();

        // 2. 获取参数
        const { id } = await context.params;
        const workflowId = Number.parseInt(id);

        if (Number.isNaN(workflowId)) {
            return NextResponse.json(
                { error: "Invalid workflow ID" },
                { status: 400 },
            );
        }

        // 3. 解析请求体
        const body = (await request.json()) as {
            name?: string;
            description?: string;
            flow?: { nodes: Node[]; edges: Edge[] };
            executable?: Record<string, unknown>;
            isPublic?: boolean;
        };

        // 4. 构建更新对象
        const updateData: {
            name?: string;
            description?: string | null;
            flow?: string;
            executable?: string | null;
            isPublic?: boolean;
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
        // 使用前端传来的 executable（因为后端没有运行时注册表）
        if (body.executable !== undefined) {
            updateData.executable = JSON.stringify(body.executable);
        }
        if (body.isPublic !== undefined) {
            updateData.isPublic = body.isPublic;
        }

        // 5. 更新数据库
        const db = await getDb();
        const result = await db
            .update(workflows)
            .set(updateData)
            .where(
                and(
                    eq(workflows.id, workflowId),
                    eq(workflows.userId, user.id),
                    eq(workflows.deleted, false),
                ),
            )
            .returning({ id: workflows.id });

        if (result.length === 0) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 },
            );
        }

        // 6. 返回结果
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error updating workflow:", error);

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
            { error: "Failed to update workflow" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/workspace/[id]
 * 删除工作流（软删除）
 */
export async function DELETE(
    request: NextRequest,
    context: { params: Params },
) {
    try {
        // 1. 认证检查
        const user = await requireAuth();

        // 2. 获取参数
        const { id } = await context.params;
        const workflowId = Number.parseInt(id);

        if (Number.isNaN(workflowId)) {
            return NextResponse.json(
                { error: "Invalid workflow ID" },
                { status: 400 },
            );
        }

        // 3. 软删除
        const db = await getDb();
        const result = await db
            .update(workflows)
            .set({ deleted: true })
            .where(
                and(
                    eq(workflows.id, workflowId),
                    eq(workflows.userId, user.id),
                ),
            )
            .returning({ id: workflows.id });

        if (result.length === 0) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 },
            );
        }

        // 4. 返回结果
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting workflow:", error);

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
            { error: "Failed to delete workflow" },
            { status: 500 },
        );
    }
}
