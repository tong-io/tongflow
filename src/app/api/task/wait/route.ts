import type { NextRequest } from "next/server";
import { isTerminalStatus } from "@/constants/task-status";
import { jsonStringifyForSse } from "@/lib/json-sse";
import { logger } from "@/lib/logger";
import { isTaskRunning, onTaskEvent, type TaskEvent } from "@/lib/task/emitter";
import { dispatchTask } from "@/lib/task/runner";

/**
 * GET /api/task/wait?taskId=xxx&reconnect=false
 *
 * SSE endpoint that streams real-time task execution status.
 * Replaces the Python openapi /wait endpoint.
 *
 * - Non-reconnect mode: starts task execution and listens for events
 * - Reconnect mode: only listens for events of an already-running task
 */
export async function GET(request: NextRequest) {
    const taskId = request.nextUrl.searchParams.get("taskId");
    const reconnect = request.nextUrl.searchParams.get("reconnect") === "true";

    if (!taskId) {
        return new Response("taskId is required", { status: 400 });
    }

    // Reconnect mode: check whether the task is still running
    if (reconnect && !isTaskRunning(taskId)) {
        return new Response("Task does not exist or has already completed", {
            status: 404,
        });
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

            // Subscribe to task events
            const unsubscribe = onTaskEvent(taskId, (event: TaskEvent) => {
                if (closed) return;

                try {
                    const data = jsonStringifyForSse(event);
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));

                    // Terminal state → close the SSE connection
                    if (isTerminalStatus(event.status)) {
                        logger.debug(
                            `[SSE] Task ${taskId} reached terminal status: ${event.status}`,
                        );
                        close();
                    }
                } catch {
                    close();
                }
            });

            // Heartbeat timer (every 10 seconds)
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

            // Clean up when the client disconnects
            request.signal.addEventListener("abort", () => {
                clearInterval(heartbeat);
                close();
            });

            // Non-reconnect mode: start task execution
            if (!reconnect) {
                dispatchTask(taskId).catch((error) => {
                    logger.error(
                        `[SSE] Failed to start task ${taskId}:`,
                        error,
                    );
                    if (!closed) {
                        try {
                            const errEvent = jsonStringifyForSse({
                                id: taskId,
                                status: "FAILED",
                                data: {
                                    message: "Task failed to start",
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
