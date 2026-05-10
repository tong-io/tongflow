/**
 * Request URLs for task SSE (wait) and stop, served by Next.js Route Handlers.
 */

export function getTaskWaitUrl(taskId: string, reconnect?: boolean): string {
    const params = new URLSearchParams({ taskId });
    if (reconnect) {
        params.set("reconnect", "true");
    }
    return `/api/task/wait?${params.toString()}`;
}

export function getTaskStopUrl(): string {
    return "/api/task/stop";
}
