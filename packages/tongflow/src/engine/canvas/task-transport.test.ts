import { describe, expect, it, vi } from "vitest";
import type {
    CanvasTaskTransport,
    TaskWaitMessage,
} from "../../canvas/lib/task/transport-types";
import type { PluginsRegistry } from "../../core/registry/plugins-registry-schema";
import { base64ToUtf8, utf8ToBase64 } from "../base64";
import { createInProcessEdgeExecutor } from "../executors/in-process";
import { MemoryAssetStore } from "../memory-store";
import { defineEdgePlugin, edgeMethod } from "../worker/define-edge-plugin";
import {
    createEngineTaskTransport,
    ENGINE_TASK_PREFIX,
    singleNodeWorkflow,
} from "./task-transport";

const REGISTRY: Pick<PluginsRegistry, "plugins"> = {
    plugins: {
        "tongflow-edge-x": {
            localSubdir: "tongflow-edge-x",
            entryFile: "dist/index.js",
            runtime: "browser",
            methodsByNodeSlot: {
                "image-orient": { methodName: "orient" },
                "detect-language": { methodName: "lang" },
            },
        },
    },
};

const PLUGIN = defineEdgePlugin({
    methods: {
        orient: edgeMethod("image-orient", async (input, ctx) => {
            ctx.progress("rotating", 50);
            return {
                success: true,
                image: {
                    bytesBase64: utf8ToBase64(
                        `upright(${ctx.params.angle ?? 0}):${base64ToUtf8(input.image.bytesBase64)}`,
                    ),
                    mime: "image/png",
                    filename: "upright.png",
                },
            };
        }),
        lang: edgeMethod("detect-language", (input, ctx) => {
            if (input.text === "boom") throw new Error("no letters");
            return new Promise((resolve, reject) => {
                if (input.text !== "wait")
                    return resolve({ success: true, language: "en" });
                ctx.signal.addEventListener("abort", () =>
                    reject(
                        Object.assign(new Error("aborted"), {
                            name: "AbortError",
                        }),
                    ),
                );
            });
        }),
    },
});

function fallbackTransport(): CanvasTaskTransport {
    return {
        createTask: vi.fn(async () => ({ taskId: "server-1" })),
        waitTask: vi.fn(() => ({ close: () => {} })),
        stopTask: vi.fn(async () => true),
        updateTaskStatus: vi.fn(async () => ({ success: true })),
    };
}

function setup() {
    const store = new MemoryAssetStore({
        "uploads/photo.png": new TextEncoder().encode("PHOTO"),
    });
    const fallback = fallbackTransport();
    const transport = createEngineTaskTransport({
        executor: createInProcessEdgeExecutor({
            registry: REGISTRY,
            loadPlugin: () => PLUGIN,
        }),
        store,
        fallback,
        handles: (r) => r.pluginId.startsWith("tongflow-edge-"),
    });
    return { store, fallback, transport };
}

function waitAll(transport: CanvasTaskTransport, taskId: string) {
    return new Promise<TaskWaitMessage[]>((resolve) => {
        const messages: TaskWaitMessage[] = [];
        transport.waitTask(taskId, {
            onOpen: () => {},
            onMessage: (m) => messages.push(m),
            onClose: () => resolve(messages),
            onError: () => {},
        });
    });
}

describe("singleNodeWorkflow", () => {
    it("binds the prompt statically and declares the slot's output routes", () => {
        const doc = singleNodeWorkflow({
            feature: "image-orient",
            pluginId: "tongflow-edge-x",
            model: "m",
            params: { angle: 90 },
            prompt: { image: "uploads/photo.png", unused: null },
            nodeId: "n1",
        });
        const node = doc.executableNodes[0];
        expect(node).toMatchObject({
            id: "n1",
            feature: "image-orient",
            pluginId: "tongflow-edge-x",
            model: "m",
            params: { angle: 90 },
            bindings: { image: { kind: "static", value: "uploads/photo.png" } },
        });
        expect(node.outputs.map((o) => o.sourceField)).toEqual(["image"]);
        expect(doc.executionLevels).toEqual([["n1"]]);
    });

    it("refuses an unknown slot", () => {
        expect(() =>
            singleNodeWorkflow({
                feature: "nope",
                pluginId: "p",
                prompt: {},
                nodeId: "n",
            }),
        ).toThrow('Unknown ABI slot "nope"');
    });
});

describe("createEngineTaskTransport", () => {
    it("runs a handled task on the engine: asset in, stored ref out", async () => {
        const { transport, store, fallback } = setup();
        const { taskId } = await transport.createTask({
            feature: "image-orient",
            pluginId: "tongflow-edge-x",
            params: { angle: 90 },
            prompt: { image: "uploads/photo.png" },
            nodeId: "n1",
        });
        expect(taskId.startsWith(ENGINE_TASK_PREFIX)).toBe(true);
        const messages = await waitAll(transport, taskId);
        expect(messages.map((m) => m.status)).toEqual([
            "PENDING",
            "RUNNING",
            "RUNNING",
            "COMPLETED",
        ]);
        expect(messages[2]).toMatchObject({
            nodeId: "n1",
            progress: 50,
            data: { message: "rotating", progress: 50 },
        });
        const done = messages[3].data as {
            success: boolean;
            image: { file_key: string; mime: string };
        };
        expect(done.success).toBe(true);
        expect(done.image.mime).toBe("image/png");
        expect(
            new TextDecoder().decode(
                (await store.get(done.image.file_key)) ?? undefined,
            ),
        ).toBe("upright(90):PHOTO");
        expect(fallback.createTask).not.toHaveBeenCalled();
        // A later wait replays the whole task; status updates stay local.
        expect((await waitAll(transport, taskId)).at(-1)?.status).toBe(
            "COMPLETED",
        );
        await expect(
            transport.updateTaskStatus({ taskId, status: "COMPLETED" }),
        ).resolves.toEqual({ success: true, skipped: true });
        expect(fallback.updateTaskStatus).not.toHaveBeenCalled();
    });

    it("reports a plugin failure as FAILED with the plugin's message", async () => {
        const { transport } = setup();
        const { taskId } = await transport.createTask({
            feature: "detect-language",
            pluginId: "tongflow-edge-x",
            prompt: { text: "boom" },
            nodeId: "n2",
        });
        const last = (await waitAll(transport, taskId)).at(-1);
        expect(last).toMatchObject({ status: "FAILED", nodeId: "n2" });
        expect(last?.error).toContain("no letters");
    });

    it("stops a running task", async () => {
        const { transport } = setup();
        const { taskId } = await transport.createTask({
            feature: "detect-language",
            pluginId: "tongflow-edge-x",
            prompt: { text: "wait" },
            nodeId: "n3",
        });
        const all = waitAll(transport, taskId);
        await new Promise((r) => setTimeout(r, 10));
        await expect(transport.stopTask(taskId)).resolves.toBe(true);
        expect((await all).at(-1)?.status).toBe("CANCELLED");
        await expect(transport.stopTask(taskId)).resolves.toBe(false);
    });

    it("hands every other task to the fallback transport", async () => {
        const { transport, fallback } = setup();
        const request = {
            feature: "gen-text",
            pluginId: "tongflow-api-openai",
            prompt: { text: "hi" },
            nodeId: "n4",
        };
        await expect(transport.createTask(request)).resolves.toEqual({
            taskId: "server-1",
        });
        expect(fallback.createTask).toHaveBeenCalledWith(request);
        const handlers = {
            onOpen: () => {},
            onMessage: () => {},
            onClose: () => {},
            onError: () => {},
        };
        transport.waitTask("server-1", handlers);
        expect(fallback.waitTask).toHaveBeenCalledWith("server-1", handlers);
        await transport.stopTask("server-1");
        expect(fallback.stopTask).toHaveBeenCalledWith("server-1");
        await transport.updateTaskStatus({
            taskId: "server-1",
            status: "COMPLETED",
        });
        expect(fallback.updateTaskStatus).toHaveBeenCalled();
    });
});
