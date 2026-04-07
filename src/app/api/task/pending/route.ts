/**
 * GET /api/task/pending
 * 获取当前用户最新的未完成工作流任务
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";

export async function GET() {
    try {
        // 1. 获取当前用户（不强制要求登录）
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ task: null });
        }

        // 2. 查询最新的未完成工作流任务
        const db = await getDb();
        const result = await db
            .select()
            .from(tasks)
            .where(
                and(
                    eq(tasks.userId, user.id),
                    eq(tasks.feature, "workflow"), // 只查工作流任务
                    inArray(tasks.status, ["pending", "processing"]), // 未完成状态
                ),
            )
            .orderBy(desc(tasks.createdAt))
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json({ task: null });
        }

        const task = result[0];

        // 3. 返回任务信息
        return NextResponse.json({
            task: {
                id: task.id,
                status: task.status,
                progress: task.progress,
                createdAt: task.createdAt,
            },
        });
    } catch (error) {
        console.error("[API /api/task/pending] Error:", error);
        return NextResponse.json({ task: null });
    }
}
