/**
 * Task transport: the HTTP default keeps the wire behaviour the canvas has
 * always had (same endpoints, bodies and `EventSource` stream), and a host
 * transport configured on `CanvasHostConfig` replaces it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { configureCanvasHost } from "../../host";
import {
    type CanvasTaskTransport,
    getTaskTransport,
    httpTaskTransport,
    openTaskWait,
    type TaskWaitHandlers,
} from "./transport";

/** Minimal `EventSource` double recording what the canvas does with it. */
class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;
    listeners = new Map<string, () => void>();
    closed = false;
    constructor(readonly url: string) {
        FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, listener: () => void) {
        this.listeners.set(type, listener);
    }
    close() {
        this.closed = true;
    }
}

function recordingHandlers() {
    const calls: Array<[string, unknown?]> = [];
    const handlers: TaskWaitHandlers = {
        onOpen: () => calls.push(["open"]),
        onMessage: (m) => calls.push(["message", m]),
        onClose: () => calls.push(["close"]),
        onError: (e) => calls.push(["error", e]),
    };
    return { calls, handlers };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
        ...init,
    });
}

afterEach(() => {
    configureCanvasHost({
        apiBaseUrl: "",
        fetch: undefined,
        taskTransport: undefined,
    });
    FakeEventSource.instances = [];
    vi.unstubAllGlobals();
});

describe("httpTaskTransport (default)", () => {
    it("is what the canvas uses when the host configures none", () => {
        expect(getTaskTransport()).toBe(httpTaskTransport);
    });

    it("streams /api/task/wait over EventSource", () => {
        vi.stubGlobal("EventSource", FakeEventSource);
        configureCanvasHost({ apiBaseUrl: "https://api.example" });
        const { calls, handlers } = recordingHandlers();

        const connection = httpTaskTransport.waitTask("t-1", handlers);
        const [es] = FakeEventSource.instances;
        expect(es.url).toBe("https://api.example/api/task/wait?taskId=t-1");

        es.onopen?.();
        es.onmessage?.({
            data: JSON.stringify({ id: "t-1", status: "RUNNING" }),
        });
        es.onmessage?.({ data: "not json" }); // dropped, not delivered
        es.listeners.get("close")?.();
        es.onerror?.("boom");
        expect(calls).toEqual([
            ["open"],
            ["message", { id: "t-1", status: "RUNNING" }],
            ["close"],
            ["error", "boom"],
        ]);

        connection.close();
        expect(es.closed).toBe(true);
    });

    it("creates, stops and reports through the host fetch", async () => {
        const requests: Array<{ url: string; body: unknown }> = [];
        configureCanvasHost({
            apiBaseUrl: "https://api.example",
            fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
                requests.push({
                    url: String(input),
                    body: JSON.parse(String(init?.body)),
                });
                return String(input).endsWith("/create")
                    ? jsonResponse({ taskId: "t-9" })
                    : jsonResponse({ success: true });
            }) as typeof fetch,
        });

        const created = await httpTaskTransport.createTask({
            feature: "image-gen",
            pluginId: "tongflow-api-demo",
            prompt: { prompt: "a cat" },
            nodeId: "n-1",
        });
        expect(created).toEqual({ taskId: "t-9" });
        expect(await httpTaskTransport.stopTask("t-9")).toBe(true);
        await httpTaskTransport.updateTaskStatus({
            taskId: "t-9",
            status: "COMPLETED",
        });

        expect(requests).toEqual([
            {
                url: "https://api.example/api/task/create",
                body: {
                    feature: "image-gen",
                    pluginId: "tongflow-api-demo",
                    prompt: { prompt: "a cat" },
                    nodeId: "n-1",
                },
            },
            {
                url: "https://api.example/api/task/stop",
                body: { taskId: "t-9" },
            },
            {
                url: "https://api.example/api/task/update-status",
                body: { taskId: "t-9", status: "COMPLETED" },
            },
        ]);
    });

    it("stopTask resolves false when the stop request is refused", async () => {
        configureCanvasHost({
            fetch: (async () =>
                jsonResponse({}, { status: 409 })) as typeof fetch,
        });
        expect(await httpTaskTransport.stopTask("t-1")).toBe(false);
    });
});

describe("host transport", () => {
    it("replaces the default", () => {
        const custom: CanvasTaskTransport = {
            ...httpTaskTransport,
            stopTask: async () => true,
        };
        configureCanvasHost({ taskTransport: custom });
        expect(getTaskTransport()).toBe(custom);
    });

    it("openTaskWait defers handlers a transport calls synchronously", async () => {
        const closed: string[] = [];
        configureCanvasHost({
            taskTransport: {
                ...httpTaskTransport,
                waitTask: (taskId, handlers) => {
                    handlers.onOpen();
                    handlers.onMessage({ id: taskId, status: "COMPLETED" });
                    return { close: () => closed.push(taskId) };
                },
            },
        });
        const { calls, handlers } = recordingHandlers();
        const connection = openTaskWait("t-2", handlers);
        expect(calls).toEqual([]); // nothing ran before we hold `connection`
        await Promise.resolve();
        expect(calls).toEqual([
            ["open"],
            ["message", { id: "t-2", status: "COMPLETED" }],
        ]);
        connection.close();
        expect(closed).toEqual(["t-2"]);
    });
});
