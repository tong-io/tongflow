/**
 * POST /api/workflow/execute
 * Create a workflow execution task
 */

import { eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { tasks, workflows } from "@/db/schema";
import { logger } from "@/lib/logger";
import { getFeatureByName } from "@/lib/plugins/feature-registry.server";
import { getPluginConfig } from "@/lib/plugins/plugins-registry.server";
import type { ExecutableWorkflow } from "@/lib/workflow/executable-workflow";

const DEFAULT_CONCURRENT_TASKS = 3;

async function checkConcurrentTaskLimit() {
    const db = await getDb();
    const runningTasks = await db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(inArray(tasks.status, ["pending", "processing"]))
        .execute();
    const current = Number(runningTasks[0]?.count || 0);
    return {
        allowed: current < DEFAULT_CONCURRENT_TASKS,
        current,
        max: DEFAULT_CONCURRENT_TASKS,
    };
}

interface ExecutionRequest {
    workflowId: number;
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as ExecutionRequest;

        if (!body.workflowId) {
            return NextResponse.json(
                { error: "Missing workflowId in request body" },
                { status: 400 },
            );
        }

        const concurrentCheck = await checkConcurrentTaskLimit();
        if (!concurrentCheck.allowed) {
            return NextResponse.json(
                {
                    error: "CONCURRENT_TASK_LIMIT_EXCEEDED",
                    code: "CONCURRENT_TASK_LIMIT_EXCEEDED",
                    current: concurrentCheck.current,
                    max: concurrentCheck.max,
                    message: `Concurrent task limit reached (${concurrentCheck.current}/${concurrentCheck.max}). Please wait for current tasks to finish before trying again.`,
                },
                { status: 429 },
            );
        }

        const db = await getDb();
        const workflowRecord = await db.query.workflows.findFirst({
            where: eq(workflows.id, body.workflowId),
        });

        if (!workflowRecord) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 },
            );
        }

        if (workflowRecord.deleted) {
            return NextResponse.json(
                { error: "Workflow has been deleted" },
                { status: 404 },
            );
        }

        if (!workflowRecord.executable) {
            return NextResponse.json(
                { error: "Workflow has no executable data" },
                { status: 400 },
            );
        }

        let workflow: ExecutableWorkflow;
        try {
            workflow = JSON.parse(
                workflowRecord.executable,
            ) as ExecutableWorkflow;
        } catch {
            return NextResponse.json(
                { error: "Invalid executable data in workflow" },
                { status: 500 },
            );
        }

        logger.debug(`\n${"=".repeat(60)}`);
        logger.debug("[API /api/workflow/execute] Creating workflow task");
        logger.debug(`WorkflowId: ${body.workflowId}`);
        logger.debug(`Workflow: ${workflow.name || workflowRecord.name}`);
        logger.debug(
            `DataNodes: ${workflow.dataNodes?.length || 0}`,
            workflow.dataNodes?.map((n) => n.id),
        );
        logger.debug(
            `ExecutableNodes: ${workflow.executableNodes?.length || 0}`,
            workflow.executableNodes?.map((n) => `${n.id}(${n.feature})`),
        );
        logger.debug(`${"=".repeat(60)}\n`);

        // Pre-flight: the scanned registry only contains installed plugins, so a
        // node whose plugin isn't installed would fail mid-run with a generic
        // error. Reject before creating the task with a clear, actionable list.
        const missing: { nodeId: string; feature: string; pluginId: string }[] =
            [];
        for (const node of workflow.executableNodes ?? []) {
            const pid = (node.pluginId ?? "").trim();
            if (!pid || !getPluginConfig(pid)) {
                missing.push({
                    nodeId: node.id,
                    feature: node.feature,
                    pluginId: pid,
                });
            }
        }
        if (missing.length > 0) {
            const list = missing
                .map(
                    (m) =>
                        `${m.feature}${m.pluginId ? ` (${m.pluginId})` : ""}`,
                )
                .join(", ");
            const message = `Cannot run workflow: ${missing.length} node(s) have no installed plugin: ${list}. Install them from the plugin manager.`;
            return NextResponse.json(
                {
                    error: message,
                    message,
                    code: "PLUGIN_NOT_INSTALLED",
                    missing,
                },
                { status: 400 },
            );
        }

        const featureMap: Record<string, { type: string; function: string }> =
            {};
        for (const node of workflow.executableNodes) {
            if (node.feature && !featureMap[node.feature]) {
                const f = getFeatureByName(node.feature);
                if (f) {
                    featureMap[node.feature] = {
                        type: f.type,
                        function: f.function,
                    };
                }
            }
        }

        const taskId = nanoid();

        await db.insert(tasks).values({
            id: taskId,
            nodeId: "workflow",
            feature: "workflow",
            prompt: JSON.stringify({
                workflowId: body.workflowId,
                workflowName: workflow.name || workflowRecord.name,
                executableNodes: workflow.executableNodes?.length || 0,
            }),
            status: "pending",
            progress: 0,
            workflowId: body.workflowId,
        });

        logger.debug(`[API] Workflow task created: ${taskId}`);

        return NextResponse.json({
            taskId,
            message: "Workflow task created, connect to SSE for progress",
        });
    } catch (error) {
        logger.error("[API /api/workflow/execute] Error:", error);

        return NextResponse.json(
            {
                error: "Internal server error",
                message: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
