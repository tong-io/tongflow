import { type NextRequest } from "next/server";
import { onTaskEvent, isTaskRunning, type TaskEvent } from "@/lib/task-emitter";
import { executeTask } from "@/lib/task-runner";
import { isTerminalStatus } from "@/constants/task-status";

/**
 * GET /api/task/wait?taskId=xxx&reconnect=false
 *
 * SSE 端点，实时推送任务执行状态。
 * 替代 Python openapi 的 /wait 端点。
 *
 * - 非 reconnect 模式：启动任务执行并监听事件
 * - reconnect 模式：仅监听已运行任务的事件
 */
export async function GET(request: NextRequest) {
    const taskId = request.nextUrl.searchParams.get("taskId");
    const reconnect = request.nextUrl.searchParams.get("reconnect") === "true";

    if (!taskId) {
        return new Response("taskId is required", { status: 400 });
    }

    // reconnect 模式：检查任务是否仍在运行
    if (reconnect && !isTaskRunning(taskId)) {
        return new Response("任务不存在或已完成", { status: 404 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            let closed = false;

            function close() {
                if (!closed) {
                    closed = true;
                    unsubscribe();
                    controller.close();
                }
            }

            // 订阅任务事件
            const unsubscribe = onTaskEvent(taskId, (event: TaskEvent) => {
                if (closed) return;

                try {
                    const data = JSON.stringify(event);
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));

                    // 终态 → 关闭 SSE 连接
                    if (isTerminalStatus(event.status)) {
                        console.log(
                            `[SSE] Task ${taskId} reached terminal status: ${event.status}`,
                        );
                        close();
                    }
                } catch {
                    close();
                }
            });

            // 心跳定时器（每 10 秒）
            const heartbeat = setInterval(() => {
                if (closed) {
                    clearInterval(heartbeat);
                    return;
                }
                try {
                    controller.enqueue(encoder.encode(": ping\n\n"));
                } catch {
                    clearInterval(heartbeat);
                    close();
                }
            }, 10_000);

            // 客户端断开连接时清理
            request.signal.addEventListener("abort", () => {
                clearInterval(heartbeat);
                close();
            });

            // 非 reconnect 模式：启动任务执行
            if (!reconnect) {
                executeTask(taskId).catch((error) => {
                    console.error(
                        `[SSE] Failed to start task ${taskId}:`,
                        error,
                    );
                    if (!closed) {
                        try {
                            const errEvent = JSON.stringify({
                                id: taskId,
                                status: "FAILED",
                                data: {
                                    message: "任务启动失败",
                                    error: String(error),
                                },
                            });
                            controller.enqueue(
                                encoder.encode(`data: ${errEvent}\n\n`),
                            );
                        } catch {
                            // ignore
                        }
                        close();
                    }
                });
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
