import { TaskStatus } from "tongflow";
import {
    createHttpRemoteExecutor,
    type ExecutorProgress,
    type InvokeRequest,
    RemoteExecutorError,
    type RemoteFetch,
} from "tongflow/engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Next app's remote-executor endpoint, driven by the real executor
 * (`createHttpRemoteExecutor`) through a fetch that calls the route handler.
 * The plugin runner, registry and env stores are stubbed; the task event
 * backend is the default in-process one.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/task/emitter", () => import("@/ext-default/task-events"));
vi.mock("@/lib/runtime/scope.server", () => ({
    getScope: async () => "",
    runWithScope: (_scope: string, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/settings/env-store.server", () => ({
    loadEnvStore: async () => ({}),
}));
vi.mock("@/lib/plugins/plugin-env-manifests.server", () => ({
    loadPluginEnvDecls: () => [
        {
            pluginId: "tongflow-api-keyed",
            env: [{ key: "KEYED_API_KEY", required: true, url: "https://k" }],
        },
    ],
}));
const PLUGINS: Record<string, unknown> = {
    "tongflow-local-upscale": {
        localSubdir: "tongflow-local-upscale",
        methodsByNodeSlot: { "image-upscale": { methodName: "upscale" } },
    },
    "tongflow-api-keyed": {
        localSubdir: "tongflow-api-keyed",
        methodsByNodeSlot: { "image-upscale": { methodName: "upscale" } },
    },
    "tongflow-edge-essentials": {
        localSubdir: "tongflow-edge-essentials",
        runtime: "browser",
        methodsByNodeSlot: { "image-orient": { methodName: "orient" } },
    },
};
vi.mock("@/lib/plugins/plugins-registry.server", () => ({
    getPluginConfig: (id: string) => PLUGINS[id],
}));
vi.mock("@/lib/plugin-executor/prepare-asset-input.server", () => ({
    prepareAssetInput: async (_slot: string, prompt: unknown) => prompt,
}));

const execCalls: { req: Record<string, unknown>; options: unknown }[] = [];
vi.mock("@/lib/plugin-executor/execute", () => ({
    executePlugin: async (
        req: {
            taskId: string;
            input: { image: { bytesBase64: string } };
            signal: AbortSignal;
        },
        options: unknown,
    ) => {
        execCalls.push({ req: req as never, options });
        const { notifyTask } = await import("@/ext-default/task-events");
        notifyTask(req.taskId, TaskStatus.RUNNING, {
            message: "upscaling",
            percent: 25,
        });
        notifyTask(req.taskId, TaskStatus.RUNNING, {
            message: "reasoning tokens",
            thinking: true,
        });
        const input = atob(req.input.image.bytesBase64);
        if (input === "SLOW") {
            await new Promise((_, reject) =>
                req.signal.addEventListener("abort", () =>
                    reject(new Error("Task cancelled")),
                ),
            );
        }
        if (input === "BOOM") throw new Error("Plugin failed (exit=1). boom");
        return {
            success: true,
            image: { bytesBase64: btoa(`up:${input}`), mime: "image/png" },
        };
    },
}));

const { remoteInvokeResponse, stopRemoteInvoke } = await import(
    "./remote-invoke.server"
);

const stops: string[] = [];
const fetchToRoutes: RemoteFetch = async (url, init) => {
    if (url.endsWith("/api/engine/invoke/stop")) {
        const { invocationId } = JSON.parse(init.body) as {
            invocationId: string;
        };
        stops.push(invocationId);
        return Response.json(stopRemoteInvoke(invocationId));
    }
    return remoteInvokeResponse(
        new Request(`http://localhost${url}`, {
            method: "POST",
            headers: init.headers,
            body: init.body,
            ...(init.signal ? { signal: init.signal } : {}),
        }),
    );
};

function invoke(
    pluginId: string,
    photo: string,
    extra: Partial<InvokeRequest> = {},
) {
    const progress: ExecutorProgress[] = [];
    const executor = createHttpRemoteExecutor({
        baseUrl: "",
        fetch: fetchToRoutes,
    });
    const run = executor.invoke({
        pluginId,
        nodeSlot: "image-upscale",
        prompt: {
            image: { bytesBase64: btoa(photo), filename: "p.png" },
            resolution: "2k",
            _params: { scale: 2 },
        },
        model: "m-1",
        signal: new AbortController().signal,
        onProgress: (p) => progress.push(p),
        ...extra,
    });
    return { run, progress };
}

beforeEach(() => {
    execCalls.length = 0;
    stops.length = 0;
});

describe("POST /api/engine/invoke (Next app)", () => {
    it("runs the plugin through executePlugin and streams its raw output", async () => {
        const { run, progress } = invoke("tongflow-local-upscale", "PHOTO");
        expect(await run).toEqual({
            success: true,
            image: { bytesBase64: btoa("up:PHOTO"), mime: "image/png" },
        });
        // Thinking tokens are not node progress.
        expect(progress).toEqual([
            { kind: "progress", message: "upscaling", percent: 25 },
        ]);
        expect(execCalls).toHaveLength(1);
        expect(execCalls[0].options).toEqual({ inlineOutputs: true });
        expect(execCalls[0].req).toMatchObject({
            pluginId: "tongflow-local-upscale",
            nodeSlot: "image-upscale",
            model: "m-1",
            params: { scale: 2 },
            input: {
                image: { bytesBase64: btoa("PHOTO"), filename: "p.png" },
                resolution: "2k",
            },
        });
    });

    it("a plugin crash fails the node with its message", async () => {
        const { run } = invoke("tongflow-local-upscale", "BOOM");
        await expect(run).rejects.toThrow("Plugin failed (exit=1). boom");
    });

    it("refuses browser plugins, missing plugins and missing API keys before running", async () => {
        const codes: unknown[] = [];
        for (const pluginId of [
            "tongflow-edge-essentials",
            "tongflow-edge-unknown",
            "tongflow-local-nope",
            "tongflow-api-keyed",
        ]) {
            const err = await invoke(pluginId, "PHOTO").run.catch((e) => e);
            expect(err).toBeInstanceOf(RemoteExecutorError);
            expect(err.status).toBe(400);
            codes.push(err.code);
        }
        expect(codes).toEqual([
            "browser_plugin",
            "browser_plugin",
            "plugin_not_installed",
            "missing_api_key",
        ]);
        expect(execCalls).toHaveLength(0);
    });

    it("rejects a malformed body", async () => {
        const res = await remoteInvokeResponse(
            new Request("http://localhost/api/engine/invoke", {
                method: "POST",
                body: JSON.stringify({ pluginId: "tongflow-local-upscale" }),
            }),
        );
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: "invalid_request" });
    });

    it("abort posts stop and the plugin's signal fires", async () => {
        const abort = new AbortController();
        const { run } = invoke("tongflow-local-upscale", "SLOW", {
            signal: abort.signal,
            onProgress: () => abort.abort(),
        });
        await expect(run).rejects.toThrow();
        await vi.waitFor(() => expect(stops).toHaveLength(1));
        expect(stops[0]).toMatch(/^inv-/);
        const signal = (execCalls[0].req as { signal: AbortSignal }).signal;
        await vi.waitFor(() => expect(signal.aborted).toBe(true));
        // Stopping again is harmless.
        expect(stopRemoteInvoke(stops[0])).toEqual({
            status: "cancelled",
            wasRunning: false,
        });
    });
});
