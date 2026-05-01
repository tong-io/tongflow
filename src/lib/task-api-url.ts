/**
 * Request URLs for task SSE (wait) and stop.
 *
 * - When `NEXT_PUBLIC_TASK_API_URL` is not set: use the current site's Next.js Route Handlers (`/api/task/wait`, `/api/task/stop`), suitable for local development.
 * - When set (for example `https://api.tongflow.com`): use paths compatible with the legacy Python openapi: `{origin}/wait`, `{origin}/stop`.
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
