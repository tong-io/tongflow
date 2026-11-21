import { describe, expect, it } from "vitest";
import type { PluginsRegistry } from "../core/registry/plugins-registry-schema";
import type {
    ExecutableNode,
    ExecutableWorkflow,
} from "../core/workflow/executable-workflow";
import {
    convertAssetOutputsToFileRefs,
    inlineAssets,
    materializeAssetInputs,
} from "./assets";
import { base64ToUtf8, utf8ToBase64 } from "./base64";
import { createCompositeExecutor } from "./executors/composite";
import { createInProcessEdgeExecutor } from "./executors/in-process";
import { MemoryAssetStore } from "./memory-store";
import { createRunController } from "./run-controller";
import { runWorkflow } from "./run-workflow";
import type {
    EngineEvent,
    InvokeRequest,
    NodeExecutor,
    RunController,
} from "./types";
import { defineEdgePlugin, edgeMethod } from "./worker/define-edge-plugin";

const ABI = {
    "gen-text": {
        inputs: {
            required: ["text"],
            properties: { text: { type: "string" } },
        },
        outputs: { properties: { text: { type: "string" } } },
    },
    "image-orient": {
        inputs: { properties: { image: { $ref: "#/$defs/Asset" } } },
        outputs: { properties: { image: { $ref: "#/$defs/ImageRef" } } },
    },
    "image-gen-model": {
        inputs: { properties: { image: { $ref: "#/$defs/Asset" } } },
        outputs: { properties: { model: { $ref: "#/$defs/ModelRef" } } },
    },
    "concat-images": {
        inputs: {
            properties: {
                images: { type: "array", items: { $ref: "#/$defs/Asset" } },
            },
        },
        outputs: {
            properties: {
                frames: { type: "array", items: { $ref: "#/$defs/VideoRef" } },
            },
        },
    },
};

function textNode(
    id: string,
    pluginId: string,
    from: { node: string; field: string },
    level: number,
    extra: Partial<ExecutableNode> = {},
): ExecutableNode {
    return {
        id,
        type: "genTextNode",
        feature: "gen-text",
        pluginId,
        bindings: {
            text: {
                kind: "handle",
                sources: [{ fromNodeId: from.node, fromField: from.field }],
                targetHandle: "in:text",
                consumerShape: "scalar",
            },
        },
        outputs: [
            {
                sourceField: "text",
                nodeType: "textNode",
                dataField: "texts",
                expandEach: false,
            },
        ],
        dependencies: [from.node],
        level,
        ...extra,
    };
}

/** `in` text node feeding `ids` in one level. */
function oneLevel(
    nodes: { id: string; pluginId: string }[],
    extra: Partial<ExecutableNode> = {},
): ExecutableWorkflow {
    return {
        name: "t",
        version: "1.0",
        exportedAt: "",
        inputs: [],
        outputs: [],
        dataNodes: [
            {
                id: "in",
                type: "textNode",
                dataType: "text",
                isInput: false,
                staticData: { texts: ["x"] },
                level: 0,
            },
        ],
        executableNodes: nodes.map((n) =>
            textNode(
                n.id,
                n.pluginId,
                { node: "in", field: "texts" },
                1,
                extra,
            ),
        ),
        executionLevels: [nodes.map((n) => n.id)],
        dataNodeEdges: [],
        originalFlow: { nodes: [], edges: [] },
    };
}

const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
        });
    });

describe("runWorkflow scheduling", () => {
    it("runs a level in parallel by default and sequentially with concurrency 1", async () => {
        let inFlight = 0;
        let peak = 0;
        const executor: NodeExecutor = {
            async invoke({ prompt, signal }) {
                inFlight++;
                peak = Math.max(peak, inFlight);
                await sleep(5, signal);
                inFlight--;
                return { success: true, text: `${prompt.text}!` };
            },
        };
        const doc = oneLevel([
            { id: "a", pluginId: "p" },
            { id: "b", pluginId: "p" },
            { id: "c", pluginId: "p" },
        ]);
        const store = new MemoryAssetStore();
        const parallel = await runWorkflow(doc, { executor, store, abi: ABI });
        expect(parallel.status).toBe("success");
        expect(peak).toBe(3);

        peak = 0;
        const serial = await runWorkflow(doc, {
            executor,
            store,
            abi: ABI,
            concurrency: 1,
        });
        expect(peak).toBe(1);
        expect(serial.outputs).toEqual(parallel.outputs);
    });

    it("cancels running siblings when a node fails and starts nothing after it", async () => {
        const seen: string[] = [];
        const executor: NodeExecutor = {
            async invoke({ pluginId, signal }) {
                seen.push(pluginId);
                if (pluginId === "bad")
                    return { success: false, error: "boom" };
                await sleep(50, signal);
                return { success: true, text: "late" };
            },
        };
        const doc = oneLevel([
            { id: "slow", pluginId: "slow" },
            { id: "bad", pluginId: "bad" },
        ]);
        doc.executableNodes.push(
            textNode("next", "slow", { node: "slow", field: "text" }, 2),
        );
        doc.executionLevels.push(["next"]);
        const events: EngineEvent[] = [];
        const result = await runWorkflow(doc, {
            executor,
            store: new MemoryAssetStore(),
            abi: ABI,
            onEvent: (e) => events.push(e),
        });
        expect(result.status).toBe("failed");
        expect(result.errors).toEqual(["Node bad failed: boom"]);
        expect(result.outputs).toEqual({});
        expect(seen).toEqual(["slow", "bad"]);
        expect(events.map((e) => e.type)).toEqual([
            "workflow_started",
            "node_started",
            "node_started",
            "node_failed",
            "node_cancelled",
            "workflow_failed",
        ]);
    });

    it("records only the first of two failures in the same tick", async () => {
        const executor: NodeExecutor = {
            invoke: async ({ pluginId }) => ({
                success: false,
                error: pluginId,
            }),
        };
        const result = await runWorkflow(
            oneLevel([
                { id: "a", pluginId: "pa" },
                { id: "b", pluginId: "pb" },
            ]),
            { executor, store: new MemoryAssetStore(), abi: ABI },
        );
        expect(result.status).toBe("failed");
        expect(result.errors).toEqual(["Node a failed: pa"]);
    });

    it("ends `cancelled` when the caller aborts, even if the executor ignores the signal", async () => {
        const ctl = new AbortController();
        const executor: NodeExecutor = {
            invoke: () => new Promise(() => {}),
        };
        const events: EngineEvent[] = [];
        const pending = runWorkflow(oneLevel([{ id: "a", pluginId: "p" }]), {
            executor,
            store: new MemoryAssetStore(),
            abi: ABI,
            signal: ctl.signal,
            onEvent: (e) => events.push(e),
        });
        await sleep(1);
        ctl.abort();
        const result = await pending;
        expect(result.status).toBe("cancelled");
        expect(result.errors).toEqual([]);
        expect(events.at(-2)).toMatchObject({
            type: "node_cancelled",
            nodeId: "a",
        });
        expect(events.at(-1)).toMatchObject({ type: "workflow_cancelled" });
    });

    it("reports plugin progress and model downloads as distinct events", async () => {
        const executor: NodeExecutor = {
            async invoke({ onProgress }) {
                onProgress({
                    kind: "model-download",
                    model: "m",
                    loaded: 5,
                    total: 10,
                });
                onProgress({ kind: "progress", message: "half", percent: 50 });
                return { success: true, text: "done" };
            },
        };
        const events: EngineEvent[] = [];
        await runWorkflow(oneLevel([{ id: "a", pluginId: "p" }]), {
            executor,
            store: new MemoryAssetStore(),
            abi: ABI,
            onEvent: (e) => events.push(e),
        });
        expect(events).toContainEqual({
            type: "model_download",
            nodeId: "a",
            pluginId: "p",
            model: "m",
            loaded: 5,
            total: 10,
        });
        expect(events).toContainEqual({
            type: "plugin_progress",
            nodeId: "a",
            pluginId: "p",
            message: "half",
            percent: 50,
        });
    });

    it("hands advanced params under `_params` and the model to the executor", async () => {
        const calls: InvokeRequest[] = [];
        const executor: NodeExecutor = {
            async invoke(req) {
                calls.push(req);
                return { success: true, text: "ok" };
            },
        };
        await runWorkflow(
            oneLevel([{ id: "a", pluginId: "p" }], {
                model: " fast ",
                params: { steps: 2 },
            }),
            { executor, store: new MemoryAssetStore(), abi: ABI },
        );
        expect(calls[0].prompt).toEqual({ text: "x", _params: { steps: 2 } });
        expect(calls[0].model).toBe("fast");
    });

    it("fails a node whose slot is not in the ABI before calling the executor", async () => {
        let called = false;
        const doc = oneLevel([{ id: "a", pluginId: "p" }]);
        doc.executableNodes[0].feature = "no-such-slot";
        const result = await runWorkflow(doc, {
            executor: {
                async invoke() {
                    called = true;
                    return {};
                },
            },
            store: new MemoryAssetStore(),
            abi: ABI,
        });
        expect(called).toBe(false);
        expect(result.errors[0]).toContain("Invalid nodeSlot=no-such-slot");
    });
});

/** Resolves once `cond()` holds, polling on macrotasks. */
async function until(cond: () => boolean) {
    for (let i = 0; i < 200 && !cond(); i++) await sleep(1);
    expect(cond()).toBe(true);
}

describe("failure policy and run controller", () => {
    it("ends `failed` under `branch` when no node completed", async () => {
        const executor: NodeExecutor = {
            invoke: async () => ({ success: false, error: "no" }),
        };
        const doc = oneLevel([{ id: "a", pluginId: "p" }]);
        doc.executableNodes.push(
            textNode("b", "p", { node: "a", field: "text" }, 2),
        );
        doc.executionLevels.push(["b"]);
        const result = await runWorkflow(doc, {
            executor,
            store: new MemoryAssetStore(),
            abi: ABI,
            failurePolicy: "branch",
        });
        expect(result.status).toBe("failed");
        expect(result.skipped).toEqual([
            { nodeId: "b", reason: "upstream failed" },
        ]);
    });

    it("aborts the executor's signal when a running node is skipped", async () => {
        let seen: AbortSignal | undefined;
        const executor: NodeExecutor = {
            invoke: ({ signal }) => {
                seen = signal;
                return new Promise(() => {});
            },
        };
        const controller = createRunController();
        const pending = runWorkflow(oneLevel([{ id: "a", pluginId: "p" }]), {
            executor,
            store: new MemoryAssetStore(),
            abi: ABI,
            controller,
        });
        await until(() => seen !== undefined);
        expect(controller.nodeStatus("a")).toBe("running");
        expect(controller.skipNode("a")).toBe(true);
        expect(seen?.aborted).toBe(true);
        const result = await pending;
        expect(result.status).toBe("failed");
        expect(result.skipped).toEqual([
            { nodeId: "a", reason: "skipped by user" },
        ]);
        expect(controller.active).toBe(false);
        expect(controller.skipNode("a")).toBe(false);
    });

    it("starts paused, and a paused run stays open for a rerun after everything settled", async () => {
        let attempt = 0;
        const executor: NodeExecutor = {
            invoke: async ({ pluginId, prompt }) =>
                pluginId === "broken"
                    ? { success: false, error: `try ${++attempt}` }
                    : { success: true, text: `${pluginId}:${prompt.text}` },
        };
        const controller = createRunController();
        controller.pause();
        const events: EngineEvent[] = [];
        const doc = oneLevel([
            { id: "a", pluginId: "broken" },
            { id: "b", pluginId: "ok" },
        ]);
        const pending = runWorkflow(doc, {
            executor,
            store: new MemoryAssetStore(),
            abi: ABI,
            failurePolicy: "branch",
            controller,
            onEvent: (e) => {
                events.push(e);
                // Hold the run open once the level has settled.
                if (e.type === "node_failed") controller.pause();
            },
        });
        expect(events.map((e) => e.type)).toEqual([
            "workflow_started",
            "workflow_paused",
        ]);
        await sleep(2);
        expect(controller.nodeStatus("a")).toBe("pending");
        // Swap before start is allowed while paused.
        expect(controller.replaceImplementation("b", { pluginId: "ok2" })).toBe(
            true,
        );
        controller.resume();
        await until(() => controller.nodeStatus("b") === "completed");
        expect(controller.nodeStatus("a")).toBe("failed");
        expect(controller.paused).toBe(true);
        await sleep(2);
        // Nothing is left to run, but the paused run has not ended.
        expect(controller.active).toBe(true);
        expect(controller.replaceImplementation("a", { pluginId: "ok" })).toBe(
            true,
        );
        controller.resume();
        const result = await pending;
        expect(result.status).toBe("success");
        expect(result.errors).toEqual([]);
        expect(result.outputs).toEqual({
            a: { success: true, text: "ok:x" },
            b: { success: true, text: "ok2:x" },
        });
    });

    it("keeps advanced params only when the plugin stays the same", async () => {
        const calls: InvokeRequest[] = [];
        const executor: NodeExecutor = {
            async invoke(req) {
                calls.push(req);
                return { success: true, text: "ok" };
            },
        };
        const run = async (impl: { pluginId: string; model?: string }) => {
            calls.length = 0;
            const controller = createRunController();
            controller.pause();
            const pending = runWorkflow(
                oneLevel([{ id: "a", pluginId: "p" }], {
                    model: "old",
                    params: { steps: 2 },
                }),
                {
                    executor,
                    store: new MemoryAssetStore(),
                    abi: ABI,
                    controller,
                },
            );
            controller.replaceImplementation("a", impl);
            controller.resume();
            await pending;
            return calls[0];
        };
        const same = await run({ pluginId: "p", model: "new" });
        expect(same.model).toBe("new");
        expect(same.prompt._params).toEqual({ steps: 2 });
        const other = await run({ pluginId: "q" });
        expect(other.pluginId).toBe("q");
        expect(other.model).toBeUndefined();
        expect(other.prompt._params).toBeUndefined();
    });

    it("refuses a controller shared by two runs at once", async () => {
        const controller = createRunController();
        controller.pause();
        const executor: NodeExecutor = {
            invoke: async () => ({ success: true, text: "" }),
        };
        const doc = oneLevel([{ id: "a", pluginId: "p" }]);
        const opts = {
            executor,
            store: new MemoryAssetStore(),
            abi: ABI,
            controller,
        };
        const first = runWorkflow(doc, opts);
        await expect(runWorkflow(doc, opts)).rejects.toThrow(
            /already attached/,
        );
        controller.resume();
        expect((await first).status).toBe("success");
    });
});

describe("branch skip rule", () => {
    /** Slots whose inputs are all optional (no `required`). */
    const RULE_ABI = {
        ...ABI,
        "opt-text": {
            inputs: { properties: { text: { type: "string" } } },
            outputs: { properties: { text: { type: "string" } } },
        },
        "opt-texts": {
            inputs: {
                properties: {
                    texts: { type: "array", items: { type: "string" } },
                },
            },
            outputs: { properties: { text: { type: "string" } } },
        },
        "req-texts": {
            inputs: {
                required: ["texts"],
                properties: {
                    texts: { type: "array", items: { type: "string" } },
                },
            },
            outputs: { properties: { text: { type: "string" } } },
        },
    };

    /** `in` → `ok` and `bad` (level 1) → `consumer` (level 2). */
    function withConsumer(consumer: Partial<ExecutableNode>) {
        const doc = oneLevel([
            { id: "ok", pluginId: "ok" },
            { id: "bad", pluginId: "bad" },
        ]);
        doc.executableNodes.push({
            id: "consumer",
            type: "x",
            feature: "opt-text",
            pluginId: "ok",
            bindings: {},
            outputs: [],
            dependencies: [],
            level: 2,
            ...consumer,
        });
        doc.executionLevels.push(["consumer"]);
        return doc;
    }

    const handle = (sources: string[], consumerShape: "scalar" | "array") => ({
        kind: "handle" as const,
        sources: sources.map((fromNodeId) => ({
            fromNodeId,
            fromField: "text",
        })),
        targetHandle: "in:x",
        consumerShape,
    });

    async function run(
        doc: ExecutableWorkflow,
        controller?: RunController,
        onEvent?: (e: EngineEvent) => void,
    ) {
        const prompts: Record<string, Record<string, unknown>[]> = {};
        const executor: NodeExecutor = {
            invoke: async ({ pluginId, prompt }) => {
                if (pluginId === "bad") return { success: false, error: "x" };
                const id = Object.keys(prompt).join(",");
                prompts[id] = [...(prompts[id] ?? []), prompt];
                return { success: true, text: `${pluginId}:${prompt.text}` };
            },
        };
        const result = await runWorkflow(doc, {
            executor,
            store: new MemoryAssetStore(),
            abi: RULE_ABI,
            failurePolicy: "branch",
            ...(controller ? { controller } : {}),
            ...(onEvent ? { onEvent } : {}),
        });
        return { result, prompts };
    }

    it("runs a consumer whose optional single input lost its producer", async () => {
        const { result } = await run(
            withConsumer({ bindings: { text: handle(["bad"], "scalar") } }),
        );
        expect(result.status).toBe("partial");
        expect(result.skipped).toEqual([]);
        expect(result.outputs.consumer).toEqual({
            success: true,
            text: "ok:undefined",
        });
    });

    it("skips a fan-out over a failed producer even when the field is optional", async () => {
        const { result } = await run(
            withConsumer({
                bindings: { text: handle(["ok", "bad"], "scalar") },
                batchField: "text",
            }),
        );
        expect(result.skipped).toEqual([
            { nodeId: "consumer", reason: "upstream failed" },
        ]);
    });

    it("runs an optional collect input with nothing left, empty", async () => {
        const { result, prompts } = await run(
            withConsumer({
                feature: "opt-texts",
                bindings: { texts: handle(["bad"], "array") },
            }),
        );
        expect(result.skipped).toEqual([]);
        expect(prompts.texts).toEqual([{ texts: [] }]);
    });

    it("skips a consumer whose ordering-only dependency failed", async () => {
        const { result } = await run(
            withConsumer({
                bindings: { text: handle(["ok"], "scalar") },
                dependencies: ["ok", "bad"],
            }),
        );
        expect(result.skipped).toEqual([
            { nodeId: "consumer", reason: "upstream failed" },
        ]);
    });

    it("reruns a consumer that ran on partial collect inputs when the failed producer is replaced", async () => {
        const controller = createRunController();
        const doc = withConsumer({
            feature: "req-texts",
            bindings: { texts: handle(["ok", "bad"], "array") },
        });
        // Hold the run open once the consumer ran on the partial input.
        let held = false;
        const pending = run(doc, controller, (e) => {
            if (e.type === "node_completed" && e.nodeId === "consumer") {
                if (!held) controller.pause();
                held = true;
            }
        });
        await until(() => controller.nodeStatus("consumer") === "completed");
        expect(
            controller.replaceImplementation("bad", { pluginId: "v2" }),
        ).toBe(true);
        controller.resume();
        const { result, prompts } = await pending;
        expect(result.status).toBe("success");
        expect(prompts.texts).toEqual([
            { texts: ["ok:x"] },
            { texts: ["ok:x", "v2:x"] },
        ]);
    });
});

describe("assets", () => {
    it("materializes store keys, upload URLs, data URLs and http(s) URLs", async () => {
        const store = new MemoryAssetStore({
            "uploads/a.png": new TextEncoder().encode("A"),
        });
        const fetch = async (url: string) =>
            new Response(new TextEncoder().encode(`from ${url}`));
        const out = await materializeAssetInputs(
            "concat-images",
            {
                images: [
                    "uploads/a.png",
                    "/api/uploads/uploads/a.png",
                    "data:image/webp;base64,QkI=",
                    "https://example.test/c.mp3?x=1",
                    { bytesBase64: "Qw==", mime: "image/gif" },
                ],
            },
            ABI,
            store,
            fetch,
        );
        expect(out.images).toEqual([
            {
                bytesBase64: utf8ToBase64("A"),
                filename: "a.png",
                mime: "image/png",
            },
            {
                bytesBase64: utf8ToBase64("A"),
                filename: "a.png",
                mime: "image/png",
            },
            { bytesBase64: "QkI=", mime: "image/webp" },
            {
                bytesBase64: utf8ToBase64(
                    "from https://example.test/c.mp3?x=1",
                ),
                filename: "c.mp3",
                mime: "audio/mpeg",
            },
            { bytesBase64: "Qw==", mime: "image/gif" },
        ]);
    });

    it("fails clearly on a reference the store does not know", async () => {
        await expect(
            materializeAssetInputs(
                "image-orient",
                { image: "missing.png" },
                ABI,
                new MemoryAssetStore(),
            ),
        ).rejects.toThrow("Could not resolve asset reference 'missing.png'");
    });

    it("stores FileRef-family outputs, keeps ModelRef as returned", async () => {
        const store = new MemoryAssetStore();
        const frames = (await convertAssetOutputsToFileRefs(
            "concat-images",
            {
                success: true,
                frames: [
                    { bytesBase64: utf8ToBase64("f1"), mime: "video/mp4" },
                    { file_key: " k.mp4 ", filename: "k.mp4" },
                ],
            },
            ABI,
            store,
        )) as { frames: { file_key: string }[] };
        expect(frames.frames[0].file_key).toMatch(/^mem:\/\/[0-9a-f]{32}$/);
        expect(frames.frames[1]).toEqual({
            file_key: "k.mp4",
            filename: "k.mp4",
        });
        expect(await inlineAssets(frames.frames[0], store)).toEqual({
            bytesBase64: utf8ToBase64("f1"),
            mime: "video/mp4",
        });

        const model = { bytesBase64: utf8ToBase64("glb") };
        const out = await convertAssetOutputsToFileRefs(
            "image-gen-model",
            { success: true, model },
            ABI,
            store,
        );
        expect(out).toEqual({ success: true, model });
    });

    it("rejects an empty binary payload and leaves failed outputs alone", async () => {
        const store = new MemoryAssetStore();
        await expect(
            convertAssetOutputsToFileRefs(
                "image-orient",
                { success: true, image: { bytesBase64: "====" } },
                ABI,
                store,
            ),
        ).rejects.toThrow("empty binary payload");
        const failed = { success: false, image: { bytesBase64: "QQ==" } };
        expect(
            await convertAssetOutputsToFileRefs(
                "image-orient",
                failed,
                ABI,
                store,
            ),
        ).toEqual(failed);
        expect(store.size).toBe(0);
    });

    it("derives the stored extension from mime, then filename, else bin", async () => {
        const exts: string[] = [];
        const store = new MemoryAssetStore();
        const spy = {
            put: (bytes: Uint8Array, meta: { ext: string }) => {
                exts.push(meta.ext);
                return store.put(bytes, meta);
            },
            get: (k: string) => store.get(k),
            owns: (k: string) => store.owns(k),
        };
        for (const image of [
            { bytesBase64: "QQ==", mime: "image/jpeg; q=1" },
            { bytesBase64: "QQ==", filename: "x.TIFF" },
            { bytesBase64: "QQ==" },
        ]) {
            await convertAssetOutputsToFileRefs(
                "image-orient",
                { success: true, image },
                ABI,
                spy,
            );
        }
        expect(exts).toEqual(["jpg", "tiff", "bin"]);
    });
});

const REGISTRY: Pick<PluginsRegistry, "plugins"> = {
    plugins: {
        "tongflow-edge-essentials": {
            localSubdir: "tongflow-edge-essentials",
            entryFile: "dist/index.js",
            runtime: "browser",
            methodsByNodeSlot: { "gen-text": { methodName: "genText" } },
        },
        "tongflow-api-llm": {
            localSubdir: "tongflow-api-llm",
            entryFile: "entry.py",
            runtime: "python",
            methodsByNodeSlot: { "gen-text": { methodName: "gen_text" } },
        },
    },
};

const essentials = defineEdgePlugin({
    methods: {
        genText: edgeMethod("gen-text", async (input, ctx) => {
            ctx.progress("thinking", 10);
            return {
                success: true,
                text: `${input.text}|${ctx.model ?? "-"}|${JSON.stringify(ctx.params)}`,
            };
        }),
    },
});

describe("executors", () => {
    it("in-process edge executor calls the manifest method with params split out", async () => {
        const progress: unknown[] = [];
        const edge = createInProcessEdgeExecutor({
            registry: REGISTRY,
            loadPlugin: async () => ({ default: essentials }),
        });
        const out = await edge.invoke({
            pluginId: "tongflow-edge-essentials",
            nodeSlot: "gen-text",
            prompt: { text: "hi", _params: { k: 1 } },
            model: "m",
            signal: new AbortController().signal,
            onProgress: (p) => progress.push(p),
        });
        expect(out).toEqual({ success: true, text: 'hi|m|{"k":1}' });
        expect(progress).toEqual([
            { kind: "progress", message: "thinking", percent: 10 },
        ]);
        expect(() =>
            edge.check?.({
                pluginId: "tongflow-edge-essentials",
                nodeSlot: "ocr-image",
            }),
        ).toThrow("does not implement nodeSlot=ocr-image");
    });

    it("composite routes by runtime and explains a missing remote executor", async () => {
        const edge = createInProcessEdgeExecutor({
            registry: REGISTRY,
            loadPlugin: () => essentials,
        });
        const composite = createCompositeExecutor({ registry: REGISTRY, edge });
        const doc = oneLevel([
            { id: "edge", pluginId: "tongflow-edge-essentials" },
            { id: "py", pluginId: "tongflow-api-llm" },
        ]);
        const result = await runWorkflow(doc, {
            executor: composite,
            store: new MemoryAssetStore(),
            abi: ABI,
            concurrency: 1,
        });
        expect(result.outputs.edge).toEqual({ success: true, text: "x|-|{}" });
        expect(result.failures[0].nodeId).toBe("py");
        expect(result.failures[0].summary).toContain(
            "No remote executor configured: plugin tongflow-api-llm",
        );

        const remoteCalls: string[] = [];
        const withRemote = createCompositeExecutor({
            registry: REGISTRY,
            edge,
            remote: {
                async invoke(req) {
                    remoteCalls.push(req.pluginId);
                    return { success: true, text: "server" };
                },
            },
        });
        const ok = await runWorkflow(doc, {
            executor: withRemote,
            store: new MemoryAssetStore(),
            abi: ABI,
        });
        expect(ok.status).toBe("success");
        expect(remoteCalls).toEqual(["tongflow-api-llm"]);
    });

    it("treats an unregistered tongflow-edge-* plugin as browser", () => {
        const composite = createCompositeExecutor({
            registry: REGISTRY,
            remote: { invoke: async () => ({}) },
        });
        expect(() =>
            composite.check?.({
                pluginId: "tongflow-edge-new",
                nodeSlot: "gen-text",
            }),
        ).toThrow("No edge executor configured");
    });

    it("defineEdgePlugin outside a worker only returns the definition", () => {
        expect(Object.keys(essentials.methods)).toEqual(["genText"]);
        expect(base64ToUtf8(utf8ToBase64("ü"))).toBe("ü");
    });
});
