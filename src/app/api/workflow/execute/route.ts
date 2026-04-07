/**
 * POST /api/workflow/execute
 * 创建工作流执行任务
 *
 * 只接收 workflowId 参数，从数据库获取 executable
 * 前端通过 SSE 连接后端的 /wait 接口获取执行进度
 */

import { NextRequest, NextResponse } from "next/server";
import type { ExecutableWorkflow } from "@/utils/executable-workflow";
import { requireAuth } from "@/lib/auth-stub";
import { nanoid } from "nanoid";
import { getDb } from "@/db";
import { tasks, workflows } from "@/db/schema";
import { eq, inArray, and, sql } from "drizzle-orm";
import { getFeatureByName } from "@/lib/feature-registry";

const DEFAULT_CONCURRENT_TASKS = 3;

async function checkConcurrentTaskLimit(userId: string) {
    const db = await getDb();
    const runningTasks = await db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(
            and(
                eq(tasks.userId, userId),
                inArray(tasks.status, ["pending", "processing"]),
            ),
        )
        .execute();
    const current = Number(runningTasks[0]?.count || 0);
    return {
        allowed: current < DEFAULT_CONCURRENT_TASKS,
        current,
        max: DEFAULT_CONCURRENT_TASKS,
    };
}

/* ========================================================================== */
/* 类型定义                                                                    */
/* ========================================================================== */

interface ExecutionRequest {
    workflowId: number; // 已保存的工作流ID（必须）
}

/* ========================================================================== */
/* API Handler                                                                 */
/* ========================================================================== */

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth();

        const body = (await request.json()) as ExecutionRequest;

        if (!body.workflowId) {
            return NextResponse.json(
                { error: "Missing workflowId in request body" },
                { status: 400 },
            );
        }

        // 检查并发任务限制
        const concurrentCheck = await checkConcurrentTaskLimit(user.id);
        if (!concurrentCheck.allowed) {
            return NextResponse.json(
                {
                    error: "CONCURRENT_TASK_LIMIT_EXCEEDED",
                    code: "CONCURRENT_TASK_LIMIT_EXCEEDED",
                    current: concurrentCheck.current,
                    max: concurrentCheck.max,
                    message: `已达到并发任务上限 (${concurrentCheck.current}/${concurrentCheck.max})，请等待现有任务完成后再试`,
                },
                { status: 429 },
            );
        }

        // 从 workflows 表获取工作流信息
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

        // 解析 executable JSON
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

        console.log("\n" + "=".repeat(60));
        console.log("[API /api/workflow/execute] Creating workflow task");
        console.log(`User: ${user.id}`);
        console.log(`WorkflowId: ${body.workflowId}`);
        console.log(`Workflow: ${workflow.name || workflowRecord.name}`);
        console.log(
            `DataNodes: ${workflow.dataNodes?.length || 0}`,
            workflow.dataNodes?.map((n) => n.id),
        );
        console.log(
            `ExecutableNodes: ${workflow.executableNodes?.length || 0}`,
            workflow.executableNodes?.map((n) => `${n.id}(${n.feature})`),
        );
        console.log("=".repeat(60) + "\n");

        // 从注册表构建 feature -> { type, function } 映射
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

        // 创建任务 ID
        const taskId = nanoid();

        // 写入数据库 tasks 表
        await db.insert(tasks).values({
            id: taskId,
            userId: user.id,
            nodeId: "workflow",
            feature: "workflow",
            prompt: JSON.stringify({
                workflowId: body.workflowId,
                workflowName: workflow.name || workflowRecord.name,
                executableNodes: workflow.executableNodes?.length || 0,
            }),
            status: "pending",
            progress: 0,
            chargedAmount: 0,
            workflowId: body.workflowId,
            shareId: null,
        });

        console.log(`[API] Workflow task created: ${taskId}`);

        return NextResponse.json({
            taskId,
            message: "Workflow task created, connect to SSE for progress",
        });
    } catch (error) {
        console.error("[API /api/workflow/execute] Error:", error);

        return NextResponse.json(
            {
                error: "Internal server error",
                message: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
