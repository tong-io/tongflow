import { nanoid } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { ABI_NODES, type NodeSlot } from "@/generated/abi";
import { logger } from "@/lib/logger";
import { getPluginConfig } from "@/lib/plugins/plugins-registry.server";
import { getAbiNodeBySlot } from "@/lib/schema/tongflow-abi";

function isAbiNodeSlot(s: string): s is NodeSlot {
    return Object.hasOwn(ABI_NODES, s);
}

/**
 * POST /api/task/create
 *
 * Wire shape: `{ feature, pluginId, prompt, nodeId, workflowId? }`. `prompt`
 * holds only ABI business fields — routing/pluginId live at the top level and
 * are persisted in their own column.
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {
            feature: string;
            pluginId: string;
            prompt: Record<string, unknown>;
            nodeId: string;
            workflowId?: number;
        };
        const { feature, pluginId, prompt, nodeId, workflowId } = body;

        if (!feature || typeof feature !== "string") {
            return NextResponse.json(
                { error: "Feature parameter is required" },
                { status: 400 },
            );
        }

        if (!prompt || typeof prompt !== "object") {
            return NextResponse.json(
                { error: "Prompt is required" },
                { status: 400 },
            );
        }

        if (!nodeId || typeof nodeId !== "string") {
            return NextResponse.json(
                { error: "nodeId is required" },
                { status: 400 },
            );
        }

        const trimmedPluginId =
            typeof pluginId === "string" ? pluginId.trim() : "";
        if (!trimmedPluginId) {
            return NextResponse.json(
                {
                    error: "Missing pluginId: select a plugin implementation (user/repo) on the node first",
                },
                { status: 400 },
            );
        }

        const normalizedFeature = feature.trim();
        const abiNode = getAbiNodeBySlot(normalizedFeature);
        if (!abiNode) {
            return NextResponse.json(
                { error: `nodeSlot=${feature} does not exist (check the ABI)` },
                { status: 400 },
            );
        }
        const canonicalFeature = abiNode.nodeSlot;

        if (!isAbiNodeSlot(canonicalFeature)) {
            logger.error(
                `[Task] ABI_TYPES missing slot while tongflow Abi has ${canonicalFeature}`,
            );
            return NextResponse.json(
                {
                    error: "Node slot is inconsistent with the generated ABI; contact an administrator",
                },
                { status: 500 },
            );
        }

        // The scanned registry only contains installed plugins. Reject up front
        // when the plugin isn't installed so the user gets a clear, actionable
        // message instead of a generic "Task execution failed" at runtime.
        if (!getPluginConfig(trimmedPluginId)) {
            return NextResponse.json(
                {
                    error: `Plugin not installed: ${trimmedPluginId}. Install it from the plugin manager before running this node.`,
                    code: "PLUGIN_NOT_INSTALLED",
                    pluginId: trimmedPluginId,
                },
                { status: 400 },
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
                pluginId: trimmedPluginId,
                prompt: JSON.stringify(prompt),
                status: "pending",
                progress: 0,
                workflowId: workflowId ?? null,
            });
        } catch (dbError) {
            logger.error("[Task] Database write failed:", dbError);
            return NextResponse.json(
                { error: "Failed to create task; please retry later" },
                { status: 500 },
            );
        }

        logger.debug("[Task] Task created:", {
            feature: canonicalFeature,
            requestedFeature: feature,
            taskId,
            pluginId: trimmedPluginId,
        });

        return NextResponse.json({ taskId });
    } catch (error) {
        logger.error("[Task] Error creating task:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to create task; please retry later",
            },
            { status: 500 },
        );
    }
}
