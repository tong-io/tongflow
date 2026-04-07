import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { nanoid } from "nanoid";
import { getFeatureByName } from "@/lib/feature-registry";

/**
 * POST /api/task/create
 * 创建任务
 */
export async function POST(request: NextRequest) {
    try {
        // 1. 认证检查
        const user = await requireAuth();

        // 2. 解析请求体
        const body = (await request.json()) as {
            feature: string;
            prompt: Record<string, unknown>;
            nodeId: string;
            workflowId?: number; // 执行自己的 workflow 时传入
            shareId?: number; // 执行别人的 share 时传入
        };
        const { feature, prompt, nodeId, workflowId, shareId } = body;

        // 3. 验证参数
        if (!feature || typeof feature !== "string") {
            return NextResponse.json(
                { error: "功能参数不能为空" },
                { status: 400 },
            );
        }

        if (!prompt || typeof prompt !== "object") {
            return NextResponse.json(
                { error: "提示词不能为空" },
                { status: 400 },
            );
        }

        if (!nodeId || typeof nodeId !== "string") {
            return NextResponse.json(
                { error: "节点ID不能为空" },
                { status: 400 },
            );
        }

        // 4. 获取功能信息（支持历史别名，如 ii2v_first_last → image-image-gen-video）
        const featureData = getFeatureByName(feature);

        if (!featureData) {
            return NextResponse.json(
                { error: `功能${feature}不存在，该功能正在开发中，敬请期待！` },
                { status: 400 },
            );
        }

        const canonicalFeature = featureData.name;

        const db = await getDb();

        // 5. 生成任务 ID
        const taskId = nanoid();

        // 6. 写数据库任务记录
        try {
            await db.insert(tasks).values({
                id: taskId,
                userId: user.id,
                nodeId,
                feature: canonicalFeature,
                prompt: JSON.stringify(prompt),
                status: "pending",
                progress: 0,
                chargedAmount: 0,
                workflowId: workflowId ?? null, // 执行自己的 workflow
                shareId: shareId ?? null, // 执行别人的 share
            });
        } catch (dbError) {
            console.error("[Task] Database write failed:", dbError);
            return NextResponse.json(
                { error: "任务创建失败，请稍后重试" },
                { status: 500 },
            );
        }

        console.log("[Task] Task created:", {
            feature: canonicalFeature,
            requestedFeature: feature,
            userId: user.id,
            taskId,
            function: featureData.function,
        });

        // 7. 返回结果
        return NextResponse.json({ taskId });
    } catch (error) {
        console.error("[Task] Error creating task:", error);

        if (
            error instanceof Error &&
            error.message === "Authentication required"
        ) {
            return NextResponse.json({ error: "未授权" }, { status: 401 });
        }

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "创建任务失败，请稍后重试",
            },
            { status: 500 },
        );
    }
}
