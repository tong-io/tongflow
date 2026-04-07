import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { workflows, shares, materials } from "@/db/schema";
import { eq, and, or, like } from "drizzle-orm";
import { exportWorkflow } from "@/utils/workflow-exporter";
/**
 * 更新素材的代表作和分享状态
 * 根据 cover (fileKey) 找到对应的素材并标记为 isCover = true, isShared = true
 * 同时清除之前的代表作标记（同一用户下只有一个代表作）
 */
async function updateMaterialCoverStatus(
    db: Awaited<ReturnType<typeof getDb>>,
    userId: string,
    newCover: string,
    oldCover?: string | null,
) {
    try {
        // 1. 如果有旧的 cover 且与新的不同，清除旧代表作的 isCover 标记
        if (oldCover && oldCover !== newCover) {
            await db
                .update(materials)
                .set({
                    isCover: false,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(materials.userId, userId),
                        eq(materials.deleted, false),
                        or(
                            eq(materials.thumbnail, oldCover),
                            like(materials.content, `%${oldCover}%`),
                        ),
                    ),
                );
            console.log(`[Publish] Cleared old cover status for ${oldCover}`);
        }

        // 2. 设置新的代表作
        const result = await db
            .update(materials)
            .set({
                isCover: true,
                isShared: true,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(materials.userId, userId),
                    eq(materials.deleted, false),
                    or(
                        eq(materials.thumbnail, newCover),
                        like(materials.content, `%${newCover}%`),
                    ),
                ),
            );

        console.log(
            `[Publish] Marked material with cover ${newCover} as cover and published`,
        );
        return result;
    } catch (error) {
        // 非关键操作，仅记录日志
        console.error(
            "[Publish] Failed to update material cover status:",
            error,
        );
    }
}

interface PublishWorkflowRequest {
    workflowId: number;
    description: string;
    cover?: string; // 可选，默认使用 workflow.cover（最新执行结果）
}

/**
 * POST /api/workflow/publish
 * 发布工作流到 Share
 * - 如果工作流已有 currentShareId，则更新该 Share（覆盖更新）
 * - 如果没有，则创建新的 Share
 * - 需要 Pro 或更高等级
 */
export async function POST(request: NextRequest) {
    try {
        // 1. 认证检查
        const user = await requireAuth();

        // 2. 解析请求体
        const body = (await request.json()) as PublishWorkflowRequest;
        const { workflowId, description } = body;

        // 4. 验证参数
        if (!workflowId || typeof workflowId !== "number") {
            return NextResponse.json(
                { error: "Workflow ID is required" },
                { status: 400 },
            );
        }

        if (!description || typeof description !== "string") {
            return NextResponse.json(
                { error: "Description is required" },
                { status: 400 },
            );
        }

        // 4. 获取工作流
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

        // 5. 确定封面：优先使用传入的 cover，否则使用 workflow.cover（最新执行结果）
        const cover = body.cover || workflow.cover;
        if (!cover) {
            return NextResponse.json(
                {
                    error: "No cover available. Please run the workflow first to generate a result.",
                },
                { status: 400 },
            );
        }

        // 6. 解析工作流数据并生成可执行工作流
        const flowData = JSON.parse(workflow.flow) as {
            nodes: any[];
            edges: any[];
        };

        const executableWorkflow = exportWorkflow(
            flowData.nodes,
            flowData.edges,
            {
                name: workflow.name,
                description: workflow.description || "",
                includeOriginalFlow: false,
            },
        );

        // 7. 检查是否已有发布的 Share
        if (workflow.currentShareId) {
            // 更新现有的 Share（覆盖更新）
            const existingShare = await db.query.shares.findFirst({
                where: and(
                    eq(shares.id, workflow.currentShareId),
                    eq(shares.deleted, false),
                ),
            });

            if (existingShare) {
                // 检查是否有实际变化
                const newExecuteJson = JSON.stringify(executableWorkflow);
                const hasNameChange = existingShare.name !== workflow.name;
                const hasDescriptionChange =
                    existingShare.description !== description;
                const hasCoverChange = existingShare.cover !== cover;
                const hasFlowChange = existingShare.flow !== workflow.flow;
                const hasExecuteChange =
                    existingShare.execute !== newExecuteJson;

                const hasChanges =
                    hasNameChange ||
                    hasDescriptionChange ||
                    hasCoverChange ||
                    hasFlowChange ||
                    hasExecuteChange;

                if (!hasChanges) {
                    // 没有变化，返回当前版本信息
                    return NextResponse.json({
                        shareId: existingShare.id,
                        version: existingShare.version,
                        isUpdate: false,
                        noChanges: true,
                    });
                }

                // 有变化，更新 Share
                await db
                    .update(shares)
                    .set({
                        name: workflow.name,
                        description,
                        cover,
                        flow: workflow.flow,
                        execute: newExecuteJson,
                        version: existingShare.version + 1,
                        updatedAt: new Date(),
                    })
                    .where(eq(shares.id, existingShare.id));

                // 更新素材的代表作和分享状态
                await updateMaterialCoverStatus(
                    db,
                    user.id,
                    cover,
                    existingShare.cover,
                );

                return NextResponse.json({
                    shareId: existingShare.id,
                    version: existingShare.version + 1,
                    isUpdate: true,
                    noChanges: false,
                });
            }
        }

        // 7. 创建新的 Share
        const result = await db
            .insert(shares)
            .values({
                userId: user.id,
                workflowId: workflow.id,
                name: workflow.name,
                description,
                cover,
                flow: workflow.flow,
                execute: JSON.stringify(executableWorkflow),
                version: 1,
            })
            .returning({ id: shares.id });

        const newShareId = result[0].id;

        // 8. 更新工作流的 currentShareId
        await db
            .update(workflows)
            .set({
                currentShareId: newShareId,
                updatedAt: new Date(),
            })
            .where(eq(workflows.id, workflowId));

        // 9. 更新素材的代表作和分享状态
        await updateMaterialCoverStatus(db, user.id, cover);

        return NextResponse.json({
            shareId: newShareId,
            version: 1,
            isUpdate: false,
        });
    } catch (error) {
        console.error("Error publishing workflow:", error);

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
            { error: "Failed to publish workflow" },
            { status: 500 },
        );
    }
}
