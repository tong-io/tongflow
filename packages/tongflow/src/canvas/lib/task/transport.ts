/**
 * Task transport: how the canvas creates a single-node task, waits for its
 * updates, stops it and reports its terminal status.
 *
 * The default (`httpTaskTransport`) talks to a TongFlow-compatible HTTP API:
 * `POST /api/task/create`, an `EventSource` on `/api/task/wait` (SSE),
 * `POST /api/task/stop` and `POST /api/task/update-status`. A host that runs
 * tasks somewhere else (for example in the browser) passes its own
 * implementation as `CanvasHostConfig.taskTransport`; the canvas then never
 * touches the HTTP API for tasks.
 */

import { logger } from "../../../core";
import { getCanvasHost, hostFetch } from "../../host";
import {
    createTask as apiCreateTask,
    updateTaskStatus as apiUpdateTaskStatus,
} from "../api/task";
import { getTaskStopUrl, getTaskWaitUrl } from "./api-url";
import type {
    CanvasTaskTransport,
    TaskWaitConnection,
    TaskWaitHandlers,
    TaskWaitMessage,
} from "./transport-types";

export type {
    CanvasTaskTransport,
    TaskWaitConnection,
    TaskWaitHandlers,
    TaskWaitMessage,
};

/** Today's HTTP + `EventSource` behaviour. */
export const httpTaskTransport: CanvasTaskTransport = {
    createTask: (request) => apiCreateTask(request),

    waitTask: (taskId, handlers) => {
        const eventSource = new EventSource(getTaskWaitUrl(taskId));
        eventSource.onopen = () => handlers.onOpen();
        eventSource.onmessage = (event) => {
            let message: TaskWaitMessage;
            try {
                message = JSON.parse(event.data);
            } catch (error) {
                logger.error("[SSE] Error parsing message:", error, event.data);
                return;
            }
            handlers.onMessage(message);
        };
        // Backend may emit a custom `close` event
        eventSource.addEventListener("close", () => handlers.onClose());
        eventSource.onerror = (error) => handlers.onError(error);
        return { close: () => eventSource.close() };
    },

    stopTask: async (taskId) => {
        const response = await hostFetch(getTaskStopUrl(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ taskId }),
        });
        return response.ok;
    },

    updateTaskStatus: (request) => apiUpdateTaskStatus(request),
};

/** The transport the canvas uses: the host's, else `httpTaskTransport`. */
export function getTaskTransport(): CanvasTaskTransport {
    return getCanvasHost().taskTransport ?? httpTaskTransport;
}

/**
 * `getTaskTransport().waitTask`, guarded against a transport that calls a
 * handler synchronously from inside `waitTask` (before the caller holds the
 * connection): such calls are deferred to a microtask. `EventSource` never
 * does that, so for the HTTP transport this is a pass-through.
 */
export function openTaskWait(
    taskId: string,
    handlers: TaskWaitHandlers,
): TaskWaitConnection {
    let opening = true;
    const guard =
        <A extends unknown[]>(fn: (...args: A) => void) =>
        (...args: A) => {
            if (opening) queueMicrotask(() => fn(...args));
            else fn(...args);
        };
    const connection = getTaskTransport().waitTask(taskId, {
        onOpen: guard(handlers.onOpen),
        onMessage: guard(handlers.onMessage),
        onClose: guard(handlers.onClose),
        onError: guard(handlers.onError),
    });
    opening = false;
    return connection;
}
