/**
 * 任务 SSE（wait）与 stop 的请求地址。
 *
 * - 未设置 `NEXT_PUBLIC_TASK_API_URL`：使用当前站点的 Next.js Route Handlers（`/api/task/wait`、`/api/task/stop`），适合本地开发。
 * - 已设置（例如 `https://api.tongflow.com`）：使用兼容旧版 Python openapi 的路径：`{origin}/wait`、`{origin}/stop`。
 */

function getTaskApiOrigin(): string {
    return (process.env.NEXT_PUBLIC_TASK_API_URL || "").replace(/\/$/, "");
}

export function getTaskWaitUrl(taskId: string, reconnect?: boolean): string {
    const origin = getTaskApiOrigin();
    const params = new URLSearchParams({ taskId });
    if (reconnect) {
        params.set("reconnect", "true");
    }
    const q = params.toString();
    if (!origin) {
        return `/api/task/wait?${q}`;
    }
    return `${origin}/wait?${q}`;
}

export function getTaskStopUrl(): string {
    const origin = getTaskApiOrigin();
    if (!origin) {
        return "/api/task/stop";
    }
    return `${origin}/stop`;
}
