import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { nanoid } from "nanoid";
import { getAbiNodeBySlot } from "@/lib/tongflow-abi";
import { logger } from "@/lib/logger";

/**
 * POST /api/task/create
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {
            feature: string;
            prompt: Record<string, unknown>;
            nodeId: string;
            workflowId?: number;
        };
        const { feature, prompt, nodeId, workflowId } = body;

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

        const abiNode = getAbiNodeBySlot(feature);
        if (!abiNode) {
            return NextResponse.json(
                { error: `nodeSlot=${feature} 不存在（请检查 ABI）` },
                { status: 400 },
            );
        }
        const canonicalFeature = abiNode.nodeSlot;

        const pluginId =
            typeof (prompt as any).pluginId === "string"
                ? String((prompt as any).pluginId).trim()
                : "";
        if (!pluginId) {
            return NextResponse.json(
                { error: "缺少 pluginId：请先在节点里选择一个插件实现（user/repo）" },
                { status: 400 },
            );
        }

        const db = await getDb();

        const taskId = nanoid();

        try {
            await db.insert(tasks).values({
                id: taskId,
                nodeId,
                feature: canonicalFeature,
                prompt: JSON.stringify(prompt),
                status: "pending",
                progress: 0,
                workflowId: workflowId ?? null,
            });
        } catch (dbError) {
            logger.error("[Task] Database write failed:", dbError);
            return NextResponse.json(
                { error: "任务创建失败，请稍后重试" },
                { status: 500 },
            );
        }

        logger.debug("[Task] Task created:", {
            feature: canonicalFeature,
            requestedFeature: feature,
            taskId,
            pluginId,
        });

        return NextResponse.json({ taskId });
    } catch (error) {
        logger.error("[Task] Error creating task:", error);

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
