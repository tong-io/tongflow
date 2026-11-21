import { describe, expect, it, vi } from "vitest";
import type { CanvasTaskTransport } from "../../canvas/lib/task/transport-types";
import type { CanvasWorkflowRunEvent } from "../../canvas/lib/workflow/runner-types";
import type { PluginsRegistry } from "../../core/registry/plugins-registry-schema";
import type { ExecutableWorkflow } from "../../core/workflow/executable-workflow";
import { createInProcessEdgeExecutor } from "../executors/in-process";
import { MemoryAssetStore } from "../memory-store";
import type { RemoteExecutor } from "../types";
import { defineEdgePlugin, edgeMethod } from "../worker/define-edge-plugin";
import {
    createEdgeHostRuntime,
    edgeEntryUrl,
    largeModelConsent,
} from "./host-runtime";

const REGISTRY: Pick<PluginsRegistry, "plugins"> = {
    plugins: {
        "tongflow-edge-x": {
            localSubdir: "tongflow-edge-x",
            entryFile: "dist/index.js",
            runtime: "browser",
            methodsByNodeSlot: {
                "detect-language": { methodName: "lang" },
                "gen-text": { methodName: "gen", models: ["huge", "tiny"] },
            },
        },
        "tongflow-api-y": {
            localSubdir: "tongflow-api-y",
            entryFile: "entry.py",
            runtime: "python",
            methodsByNodeSlot: { "gen-text": { methodName: "gen" } },
        },
    },
};

const PLUGIN = defineEdgePlugin({
    methods: {
        lang: edgeMethod("detect-language", async () => ({
            success: true,
            language: "en",
        })),
        gen: edgeMethod("gen-text", async (input, ctx) => ({
            success: true,
            text: `${ctx.model ?? "default"}:${input.text}`,
        })),
    },
});

const fallback: CanvasTaskTransport = {
    createTask: vi.fn(async () => ({ taskId: "server-1" })),
    waitTask: vi.fn(() => ({ close: () => {} })),
    stopTask: vi.fn(async () => true),
    updateTaskStatus: vi.fn(async () => ({ success: true })),
};

const textOut = (downstream: string, field: string) => ({
    sourceField: field,
    nodeType: "textNode",
    dataField: "texts",
    expandEach: false,
    downstreamDataNodeId: downstream,
});

/** text → detect-language (browser) → gen-text (server). */
const MIXED = {
    name: "mixed",
    version: "1.0",
    exportedAt: "2026-01-01T00:00:00.000Z",
    inputs: [],
    outputs: [],
    dataNodes: [
        {
            id: "src",
            type: "textNode",
            dataType: "text",
            level: 0,
            staticData: { texts: ["hello"] },
        },
        { id: "lang", type: "textNode", dataType: "text", level: 2 },
        { id: "out", type: "textNode", dataType: "text", level: 4 },
    ],
    executableNodes: [
        {
            id: "detect",
            type: "detectLanguageNode",
            feature: "detect-language",
            pluginId: "tongflow-edge-x",
            label: "detect",
            bindings: {
                text: {
                    kind: "handle",
                    sources: [{ fromNodeId: "src", fromField: "texts" }],
                    targetHandle: "in:text",
                    consumerShape: "scalar",
                },
            },
            outputs: [textOut("lang", "language")],
            dependencies: ["src"],
            level: 1,
        },
        {
            id: "gen",
            type: "genTextNode",
            feature: "gen-text",
            pluginId: "tongflow-api-y",
            label: "gen",
            bindings: {
                text: {
                    kind: "handle",
                    sources: [{ fromNodeId: "detect", fromField: "language" }],
                    targetHandle: "in:text",
                    consumerShape: "scalar",
                },
            },
            outputs: [textOut("out", "text")],
            dependencies: ["lang"],
            level: 3,
        },
    ],
    executionLevels: [["detect"], ["gen"]],
    dataNodeEdges: [],
    originalFlow: { nodes: [], edges: [] },
} as unknown as ExecutableWorkflow;

describe("edgeEntryUrl", () => {
    it("adds an absolute modelBase to the entry URL", () => {
        expect(
            edgeEntryUrl(
                "/tongflow/plugins/files/p/v1/dist/index.js",
                "/models/",
                "http://localhost:3000",
            ),
        ).toBe(
            "http://localhost:3000/tongflow/plugins/files/p/v1/dist/index.js?modelBase=http%3A%2F%2Flocalhost%3A3000%2Fmodels%2F",
        );
    });
});

describe("largeModelConsent", () => {
    const requires = largeModelConsent({
        registry: REGISTRY,
        models: {
            "tongflow-edge-x": [
                { id: "huge", approxMB: 810 },
                { id: "tiny", approxMB: 20 },
            ],
        },
    });
    it("asks for a large model, the node's or the slot default", () => {
        expect(
            requires({ pluginId: "tongflow-edge-x", nodeSlot: "gen-text" }),
        ).toEqual({
            key: "tongflow-edge-x:huge",
            label: "huge (≈810 MB)",
            approxMB: 810,
        });
        expect(
            requires({
                pluginId: "tongflow-edge-x",
                nodeSlot: "gen-text",
                model: "tiny",
            }),
        ).toBeUndefined();
        expect(
            requires({ pluginId: "tongflow-api-y", nodeSlot: "gen-text" }),
        ).toBeUndefined();
    });
});

describe("createEdgeHostRuntime", () => {
    function runtime(ask = vi.fn(async () => true)) {
        const remote: RemoteExecutor = {
            invoke: vi.fn(async (req) => ({
                success: true,
                text: `server(${req.prompt.text})`,
            })),
        };
        const rt = createEdgeHostRuntime({
            registry: REGISTRY,
            entryUrl: () => "/x.js",
            modelBase: "https://models.example/",
            origin: "http://localhost",
            remote,
            store: new MemoryAssetStore(),
            fallbackTransport: fallback,
            edge: createInProcessEdgeExecutor({
                registry: REGISTRY,
                loadPlugin: () => PLUGIN,
            }),
            consent: {
                requires: largeModelConsent({
                    registry: REGISTRY,
                    models: {
                        "tongflow-edge-x": [{ id: "huge", approxMB: 900 }],
                    },
                }),
                ask,
            },
        });
        return { rt, remote, ask };
    }

    it("runs a mixed workflow: edge node in the browser, Python node remote", async () => {
        const { rt, remote } = runtime();
        const events: CanvasWorkflowRunEvent[] = [];
        await rt.runner.run(MIXED, {
            signal: new AbortController().signal,
            onEvent: (e) => events.push(e),
        });
        expect(remote.invoke).toHaveBeenCalledTimes(1);
        expect(events.at(-1)).toEqual({ type: "run-done", ok: true });
        expect(
            events.find((e) => e.type === "node-done" && e.nodeId === "gen"),
        ).toMatchObject({ output: { text: "server(en)" } });
    });

    it("routes single-node runs by runtime and gates large models", async () => {
        const { rt, ask } = runtime(vi.fn(async () => false));
        await rt.taskTransport.createTask({
            feature: "gen-text",
            pluginId: "tongflow-api-y",
            prompt: { text: "a" },
            nodeId: "n0",
        });
        expect(fallback.createTask).toHaveBeenCalled();
        const { taskId } = await rt.taskTransport.createTask({
            feature: "gen-text",
            pluginId: "tongflow-edge-x",
            prompt: { text: "a" },
            nodeId: "n1",
        });
        const last = await new Promise<{ status: string; error?: string }>(
            (resolve) => {
                let m: { status: string; error?: string } = { status: "" };
                rt.taskTransport.waitTask(taskId, {
                    onOpen: () => {},
                    onMessage: (x) => {
                        m = x;
                    },
                    onClose: () => resolve(m),
                    onError: () => {},
                });
            },
        );
        expect(ask).toHaveBeenCalledTimes(1);
        expect(last.status).toBe("FAILED");
        expect(last.error).toContain("you declined huge (≈900 MB)");
    });
});
