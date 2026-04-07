import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { materials, tasks, workflows, shares } from "@/db/schema";
import { eq, and, or, like } from "drizzle-orm";
import { exportWorkflow } from "@/utils/workflow-exporter";

// File Worker 的基础 URL
const FILE_WORKER_URL =
    process.env.FILE_WORKER_URL || "https://file.tongflow.com";

/**
 * 调用 File Worker 复制文件到 public/shared/
 */
async function copyFilesToPublicShared(
    materialId: number,
    sourceKeys: string[],
    cookie: string,
): Promise<{ success: boolean; publicUrls?: string[]; error?: string }> {
    try {
        const response = await fetch(`${FILE_WORKER_URL}/share`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie,
            },
            body: JSON.stringify({ materialId, sourceKeys }),
        });

        const result = (await response.json()) as {
            success: boolean;
            publicUrls?: string[];
            error?: string;
        };

        if (!response.ok) {
            return { success: false, error: result.error || "Failed to share" };
        }

        return result;
    } catch (error) {
        console.error("Error calling file worker /share:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * 调用 File Worker 删除 public/shared/ 下的文件
 */
async function deleteSharedFiles(
    materialId: number,
    cookie: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetch(`${FILE_WORKER_URL}/share/${materialId}`, {
            method: "DELETE",
            headers: {
                Cookie: cookie,
            },
        });

        const result = (await response.json()) as {
            success: boolean;
            error?: string;
        };

        if (!response.ok) {
            return {
                success: false,
                error: result.error || "Failed to unshare",
            };
        }

        return result;
    } catch (error) {
        console.error("Error calling file worker DELETE /share:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * 更新素材的代表作和分享状态
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
            console.log(`[Share] Cleared old cover status for ${oldCover}`);
        }

        // 2. 设置新的代表作
        await db
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
            `[Share] Marked material with cover ${newCover} as cover and published`,
        );
    } catch (error) {
        console.error("[Share] Failed to update material cover status:", error);
    }
}

interface ShareFromMaterialRequest {
    description: string;
}

/**
 * POST /api/material/[id]/share
 * 从作品分享工作流
 * - 自动追溯到关联的工作流
 * - 使用当前作品作为代表作
 * - 创建/更新 Share
 */
export async function POST(
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

        // 2. 解析请求体
        const body = (await request.json()) as ShareFromMaterialRequest;
        const { description } = body;

        if (!description || typeof description !== "string") {
            return NextResponse.json(
                { error: "Description is required" },
                { status: 400 },
            );
        }

        // 3. 获取素材
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

        // 4. 检查素材类型必须是图片或视频（可用作代表作）
        if (material.type !== "image" && material.type !== "video") {
            return NextResponse.json(
                {
                    error: "Only image or video materials can be shared as cover",
                },
                { status: 400 },
            );
        }

        // 5. 获取代表作 fileKey
        const content = JSON.parse(material.content) as { fileKeys?: string[] };
        const cover = material.thumbnail || content.fileKeys?.[0];

        if (!cover) {
            return NextResponse.json(
                { error: "Material has no valid cover image" },
                { status: 400 },
            );
        }

        // 6. 追溯任务
        if (!material.taskId) {
            return NextResponse.json(
                { error: "Material is not linked to any task, cannot share" },
                { status: 400 },
            );
        }

        const task = await db.query.tasks.findFirst({
            where: eq(tasks.id, material.taskId),
        });

        if (!task) {
            return NextResponse.json(
                { error: "Associated task not found" },
                { status: 400 },
            );
        }

        // 7. 处理分享逻辑 - 根据新的 workflowId/shareId 字段判断
        if (task.shareId) {
            // 作品来自别人分享的工作流，不能再次分享
            return NextResponse.json(
                {
                    error: "This material was created from a shared workflow. You cannot share it as your own.",
                    code: "CANNOT_RESHARE",
                },
                { status: 403 },
            );
        }

        if (!task.workflowId) {
            return NextResponse.json(
                { error: "Task is not linked to any workflow, cannot share" },
                { status: 400 },
            );
        }

        // 8. 获取私有工作流
        const workflow = await db.query.workflows.findFirst({
            where: and(
                eq(workflows.id, task.workflowId),
                eq(workflows.userId, user.id),
                eq(workflows.deleted, false),
            ),
        });

        if (!workflow) {
            return NextResponse.json(
                {
                    error: "Associated workflow not found or you don't have permission",
                },
                { status: 404 },
            );
        }

        // 9. 解析工作流数据并生成可执行工作流
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

        // 10. 检查是否已有发布的 Share
        if (workflow.currentShareId) {
            // 更新现有的 Share
            const existingShare = await db.query.shares.findFirst({
                where: and(
                    eq(shares.id, workflow.currentShareId),
                    eq(shares.deleted, false),
                ),
            });

            if (existingShare) {
                await db
                    .update(shares)
                    .set({
                        name: workflow.name,
                        description,
                        cover,
                        flow: workflow.flow,
                        execute: JSON.stringify(executableWorkflow),
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
                    cover,
                });
            }
        }

        // 11. 创建新的 Share
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

        // 12. 更新工作流的 currentShareId
        await db
            .update(workflows)
            .set({
                currentShareId: newShareId,
                updatedAt: new Date(),
            })
            .where(eq(workflows.id, workflow.id));

        // 13. 更新素材的代表作和分享状态
        await updateMaterialCoverStatus(db, user.id, cover);

        return NextResponse.json({
            shareId: newShareId,
            version: 1,
            isUpdate: false,
            cover,
        });
    } catch (error) {
        console.error("Error sharing material:", error);

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
            { error: "Failed to share material" },
            { status: 500 },
        );
    }
}

/**
 * PATCH /api/material/[id]/share
 * 切换素材的公开分享状态
 * - 只允许图片和视频类型的素材分享
 * - isShared=true 表示该作品可以公开展示
 * - 分享时复制文件到 public/shared/{materialId}/
 * - 取消分享时删除 public/shared/{materialId}/ 下的文件
 */
export async function PATCH(
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

        // 3. 检查素材类型必须是图片或视频
        if (material.type !== "image" && material.type !== "video") {
            return NextResponse.json(
                { error: "Only image or video materials can be shared" },
                { status: 400 },
            );
        }

        // 4. 检查是否为代表作（isCover），如果是则不能取消分享
        if (material.isCover && material.isShared) {
            return NextResponse.json(
                {
                    error: "代表作不能取消分享",
                    code: "CANNOT_UNSHARE_COVER",
                },
                { status: 403 },
            );
        }

        // 5. 获取 Cookie 用于调用 file-worker
        const cookie = request.headers.get("Cookie") || "";

        // 6. 切换分享状态
        const newIsShared = !material.isShared;

        if (newIsShared) {
            // 分享：复制文件到 public/shared/
            const content = JSON.parse(material.content) as {
                fileKeys?: string[];
            };
            const sourceKeys = content.fileKeys || [];

            if (sourceKeys.length > 0) {
                const shareResult = await copyFilesToPublicShared(
                    materialId,
                    sourceKeys,
                    cookie,
                );

                if (!shareResult.success) {
                    return NextResponse.json(
                        {
                            error: "Failed to copy files to public",
                            details: shareResult.error,
                        },
                        { status: 500 },
                    );
                }
            }
        } else {
            // 取消分享：删除 public/shared/{materialId}/ 下的文件
            const unshareResult = await deleteSharedFiles(materialId, cookie);

            if (!unshareResult.success) {
                console.warn(
                    "Failed to delete shared files:",
                    unshareResult.error,
                );
                // 不阻止取消分享操作，仅记录警告
            }
        }

        // 7. 更新数据库
        await db
            .update(materials)
            .set({
                isShared: newIsShared,
                updatedAt: new Date(),
            })
            .where(eq(materials.id, materialId));

        return NextResponse.json({ isShared: newIsShared });
    } catch (error) {
        console.error("Error toggling material share:", error);

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
            { error: "Failed to toggle material share" },
            { status: 500 },
        );
    }
}
