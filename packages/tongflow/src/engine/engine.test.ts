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
import { runWorkflow } from "./run-workflow";
import type { EngineEvent, InvokeRequest, NodeExecutor } from "./types";
import { defineEdgePlugin, edgeMethod } from "./worker/define-edge-plugin";

const ABI = {
    "gen-text": {
        inputs: { properties: { text: { type: "string" } } },
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
