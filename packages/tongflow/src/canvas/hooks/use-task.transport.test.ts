/**
 * Transport injection end to end through the task hooks: with a host
 * `taskTransport`, a node's run is created, streamed and reported entirely
 * in-process (no HTTP, no `EventSource`), and the node's handlers see the
 * task reach COMPLETED or FAILED exactly as they do over SSE.
 *
 * The hooks are rendered once with `react-dom/server` to obtain their
 * callbacks (`createBatchTasks` is a `useCallback`); everything they drive
 * afterwards lives in the global zustand task store, which is what nodes
 * subscribe to.
 */

import { type ComponentProps, createElement } from "react";
import { renderToString } from "react-dom/server";
import { IntlProvider } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

import { configureCanvasHost } from "../host";
import type { CreateTaskRequest } from "../lib/api/task";
import type {
    CanvasTaskTransport,
    TaskWaitHandlers,
    TaskWaitMessage,
} from "../lib/task/transport";
import {
    type Task,
    useBatchTaskManager,
    useCreateTask,
    useTaskStore,
} from "./use-task";

const messages = {
    Workspace: {
        toast: {
            taskCompleted: "Task completed",
            cancelling: "Cancelling",
            cancelled: "Cancelled",
        },
    },
};

function capture<T>(useHook: () => T): T {
    let value: T | undefined;
    function Probe() {
        value = useHook();
        return null;
    }
    // `children` is replaced by the third `createElement` argument.
    const intl: ComponentProps<typeof IntlProvider> = {
        locale: "en",
        messages,
        children: null,
    };
    renderToString(createElement(IntlProvider, intl, createElement(Probe)));
    if (value === undefined) throw new Error("hook did not render");
    return value;
}

/** An in-browser transport double: tasks run when the test says so. */
function fakeTransport() {
    const created: CreateTaskRequest[] = [];
    const streams = new Map<string, TaskWaitHandlers>();
    const closed: string[] = [];
    const reported: Array<{ taskId: string; status: string }> = [];
    let next = 0;
    const transport: CanvasTaskTransport = {
        createTask: async (request) => {
            created.push(request);
            next += 1;
            return { taskId: `local-${next}` };
        },
        waitTask: (taskId, handlers) => {
            streams.set(taskId, handlers);
            return { close: () => closed.push(taskId) };
        },
        stopTask: async () => true,
        updateTaskStatus: async ({ taskId, status }) => {
            reported.push({ taskId, status });
            return { success: true };
        },
    };
    const emit = (taskId: string, message: Omit<TaskWaitMessage, "id">) => {
        const handlers = streams.get(taskId);
        if (!handlers) throw new Error(`no stream for ${taskId}`);
        handlers.onMessage({ id: taskId, ...message });
    };
    return { transport, created, streams, closed, reported, emit };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function nodeUpdates(nodeId: string): Task[] {
    const seen: Task[] = [];
    useTaskStore.getState().registerNodeHandler(nodeId, (task) => {
        seen.push(task);
    });
    return seen;
}

const config = (nodeId: string) => ({
    feature: "image-gen",
    pluginId: "tongflow-edge-demo",
    prompt: { prompt: "a cat" },
    nodeId,
});

beforeEach(() => {
    // Any fallback to the HTTP transport would hit one of these.
    vi.stubGlobal("EventSource", () => {
        throw new Error("EventSource must not be used");
    });
    vi.stubGlobal("fetch", () => {
        throw new Error("fetch must not be used");
    });
    useTaskStore.setState({
        tasks: new Map(),
        taskNodeMap: new Map(),
        nodeHandlers: new Map(),
    });
});

afterEach(() => {
    configureCanvasHost({ taskTransport: undefined });
    vi.unstubAllGlobals();
});

describe("task hooks over a host transport", () => {
    it("drives a node's batch to COMPLETED", async () => {
        const fake = fakeTransport();
        configureCanvasHost({ taskTransport: fake.transport });
        const seen = nodeUpdates("node-a");

        const { createBatchTasks } = capture(() => useBatchTaskManager());
        const ids = await createBatchTasks([config("node-a")]);
        expect(ids).toEqual(["local-1"]);
        expect(fake.created).toEqual([config("node-a")]);
        expect(useTaskStore.getState().getTask("local-1")?.status).toBe(
            "PENDING",
        );

        await flush();
        fake.streams.get("local-1")?.onOpen();
        fake.emit("local-1", {
            status: "RUNNING",
            data: { message: "loading model" },
        });
        fake.emit("local-1", {
            status: "COMPLETED",
            data: { images: [{ file_key: "out/cat.png" }] },
        });

        expect(seen.map((t) => t.status)).toEqual(["PROCESSING", "COMPLETED"]);
        expect(seen[1]).toMatchObject({
            id: "local-1",
            nodeId: "node-a",
            data: { images: [{ file_key: "out/cat.png" }] },
        });
        expect(useTaskStore.getState().getTask("local-1")?.status).toBe(
            "COMPLETED",
        );
        expect(fake.reported).toEqual([
            { taskId: "local-1", status: "COMPLETED" },
        ]);
        expect(fake.closed).toEqual(["local-1"]);
    });

    it("drives a node's batch to FAILED", async () => {
        const fake = fakeTransport();
        configureCanvasHost({ taskTransport: fake.transport });
        const seen = nodeUpdates("node-b");

        const { createBatchTasks } = capture(() => useBatchTaskManager());
        await createBatchTasks([config("node-b")]);
        await flush();
        fake.emit("local-1", { status: "FAILED", error: "out of memory" });

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({
            status: "FAILED",
            error: "out of memory",
            nodeId: "node-b",
        });
        expect(fake.reported).toEqual([
            { taskId: "local-1", status: "FAILED" },
        ]);
        expect(fake.closed).toEqual(["local-1"]);
    });

    it("useCreateTask creates through the transport", async () => {
        const fake = fakeTransport();
        configureCanvasHost({ taskTransport: fake.transport });

        const { createTask } = capture(() => useCreateTask());
        const taskId = await createTask(config("node-c"));
        expect(taskId).toBe("local-1");
        expect(fake.created).toEqual([config("node-c")]);
        expect(useTaskStore.getState().getTaskNodeId("local-1")).toBe("node-c");
    });
});
