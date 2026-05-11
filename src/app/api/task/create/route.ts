import { nanoid } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { ABI_NODES, type NodeSlot } from "@/generated/abi";
import { logger } from "@/lib/logger";
import {
    buildPersistedTaskPrompt,
    resolveRoutingPluginId,
} from "@/lib/task-prompt-routing";
import { getAbiNodeBySlot } from "@/lib/tongflow-abi";

function isAbiNodeSlot(s: string): s is NodeSlot {
    return Object.hasOwn(ABI_NODES, s);
}

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
            routing?: { pluginId?: string };
        };
        const {
            feature,
            prompt,
            nodeId,
            workflowId,
            routing: bodyRouting,
        } = body;

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

        const normalizedFeature = feature.trim();
        const abiNode = getAbiNodeBySlot(normalizedFeature);
        if (!abiNode) {
            return NextResponse.json(
                { error: `nodeSlot=${feature} 不存在（请检查 ABI）` },
                { status: 400 },
            );
        }
        const canonicalFeature = abiNode.nodeSlot;

        const mergedPrompt: Record<string, unknown> = { ...prompt };
        if (bodyRouting && typeof bodyRouting === "object") {
            const prev =
                mergedPrompt.routing &&
                typeof mergedPrompt.routing === "object" &&
                !Array.isArray(mergedPrompt.routing)
                    ? (mergedPrompt.routing as Record<string, unknown>)
                    : {};
            mergedPrompt.routing = { ...prev, ...bodyRouting };
        }

        const pluginId = resolveRoutingPluginId(mergedPrompt);
        if (!pluginId) {
            return NextResponse.json(
                {
                    error: "缺少 pluginId：请先在节点里选择一个插件实现（user/repo）",
                },
                { status: 400 },
            );
        }

        if (!isAbiNodeSlot(canonicalFeature)) {
            logger.error(
                `[Task] ABI_TYPES missing slot while tongflow Abi has ${canonicalFeature}`,
            );
            return NextResponse.json(
                { error: "节点槽位与生成 ABI 不一致，请联系管理员" },
                { status: 500 },
            );
        }

        // ABI input validation runs in `task-runner` after `prepareAssetInput`
        // materializes Asset bytes; the persisted prompt stores the slim form
        // (fileKey strings) to keep the DB row small.

        const db = await getDb();

        const taskId = nanoid();

        try {
            await db.insert(tasks).values({
                id: taskId,
                nodeId,
                feature: canonicalFeature,
                prompt: JSON.stringify(
                    buildPersistedTaskPrompt(mergedPrompt, pluginId),
                ),
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
