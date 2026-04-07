import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { workflows } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { Node, Edge } from "@xyflow/react";

/**
 * POST /api/workspace/save
 * 保存工作流
 * 前端生成 executable 并传给后端（因为需要运行时注册表中的节点配置）
 */
export async function POST(request: NextRequest) {
    try {
        // 1. 认证检查
        const user = await requireAuth();

        // 2. 解析请求体
        const body = (await request.json()) as {
            workflowId?: number; // 已保存的工作流传入 ID 进行更新
            name: string;
            description?: string;
            flow: { nodes: Node[]; edges: Edge[] };
            executable?: Record<string, unknown>;
            isPublic?: boolean;
        };
        const { workflowId, name, description, flow, executable, isPublic } =
            body;

        // 3. 验证参数
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

        // 4. 保存到数据库（executable 由前端生成）
        const db = await getDb();

        let resultId: number;

        if (workflowId) {
            // 已保存的工作流：更新现有记录（需验证所有权）
            const existing = await db
                .select({ id: workflows.id })
                .from(workflows)
                .where(
                    and(
                        eq(workflows.id, workflowId),
                        eq(workflows.userId, user.id),
                    ),
                )
                .limit(1);

            if (existing.length === 0) {
                return NextResponse.json(
                    { error: "Workflow not found or access denied" },
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
                    isPublic: isPublic || false,
                    updatedAt: new Date(),
                })
                .where(eq(workflows.id, workflowId));

            resultId = workflowId;
        } else {
            // 新工作流：插入新记录
            const result = await db
                .insert(workflows)
                .values({
                    userId: user.id,
                    name,
                    description: description || null,
                    flow: JSON.stringify(flow),
                    executable: executable ? JSON.stringify(executable) : null,
                    isPublic: isPublic || false,
                })
                .returning({ id: workflows.id });

            resultId = result[0].id;
        }

        // 5. 返回结果
        return NextResponse.json({
            workflowId: resultId,
        });
    } catch (error) {
        console.error("Error saving workflow:", error);

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
            { error: "Failed to save workflow" },
            { status: 500 },
        );
    }
}
