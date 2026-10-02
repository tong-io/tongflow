/** Server-sent events on a raw ServerResponse. */
import type { IncomingMessage, ServerResponse } from "node:http";

export interface SseStream {
    send(data: unknown, event?: string): void;
    close(): void;
    readonly closed: boolean;
}

export function openSse(req: IncomingMessage, res: ServerResponse): SseStream {
    res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
    });
    res.write(": ok\n\n");
    let closed = false;
    const heartbeat = setInterval(() => {
        if (!closed) res.write(": ping\n\n");
    }, 15000);
    heartbeat.unref();
    const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
            res.end();
        } catch {
            // ignore
        }
    };
    req.on("close", finish);
    return {
        send(data, event) {
            if (closed) return;
            if (event) res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        },
        close: finish,
        get closed() {
            return closed;
        },
    };
}
