import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutableWorkflow } from "tongflow";
import {
    base64ToUtf8,
    createCompositeExecutor,
    createHttpRemoteExecutor,
    createInProcessEdgeExecutor,
    type EngineEvent,
    type ExecutorRegistry,
    MemoryAssetStore,
    type RemoteConfirmation,
    runWorkflow,
    utf8ToBase64,
} from "tongflow/engine";
import { defineEdgePlugin, edgeMethod } from "tongflow/engine/worker";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioApi } from "../src/api.ts";
import { studioConfig } from "../src/config.ts";
import { createProject } from "../src/project/manifest.ts";
import { type StudioServer, serveStudio } from "../src/serve.ts";
import { Studio } from "../src/studio.ts";

/**
 * A mixed graph: the browser engine (`tongflow/engine`) runs the edge nodes
 * in process and sends the Python node to a real Studio server through the
 * HTTP remote executor. The server's Python runtime is a stand-in for
 * `python`, as in engine.test.ts: `-m tongflow scan` prints a registry with a
 * fake Python plugin, `-m tongflow engine` speaks the NDJSON bridge and
 * plays that plugin.
 */
const FAKE_PYTHON = String.raw`
const fs = require("fs"), path = require("path");
const args = process.argv.slice(2);
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s) => Buffer.from(s, "base64").toString("utf8");
const method = (name) => ({ methodName: name });
if (args[2] === "scan") {
  process.stdout.write(JSON.stringify({
    version: 1,
    generatedAt: "2026-01-01T00:00:00Z",
    nodePluginMap: {
      "image-upscale": ["tongflow-local-upscale", "tongflow-api-paid"],
      "image-orient": ["tongflow-edge-essentials"],
      "detect-objects": ["tongflow-edge-essentials"],
    },
    plugins: {
      "tongflow-local-upscale": { localSubdir: "tongflow-local-upscale", entryFile: "entry.py", runtime: "python", methodsByNodeSlot: { "image-upscale": method("upscale") } },
      "tongflow-api-paid": { localSubdir: "tongflow-api-paid", entryFile: "entry.py", runtime: "python", methodsByNodeSlot: { "image-upscale": method("upscale") } },
      "tongflow-edge-essentials": { localSubdir: "tongflow-edge-essentials", entryFile: "index.js", runtime: "browser", methodsByNodeSlot: { "image-orient": method("orient"), "detect-objects": method("detect") } },
    },
  }));
  process.exit(0);
}
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  const req = JSON.parse(raw);
  fs.writeFileSync(path.join(__dirname, "last-request.json"), raw);
  const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  emit({ ready: { version: "test" } });
  const node = req.workflow.executableNodes[0];
  const prompt = {};
  for (const [k, b] of Object.entries(node.bindings)) prompt[k] = b.value;
  emit({ event: { type: "workflow_started", totalNodes: 1, levels: 1 } });
  emit({ event: { type: "node_started", nodeId: node.id, level: 1, feature: node.feature, label: node.label } });
  // Subprocess progress carries the plugin id, not the node id.
  emit({ event: { type: "plugin_progress", pluginId: node.pluginId, message: "upscaling", percent: 50 } });
  const input = unb64(prompt.image.bytesBase64);
  if (input.includes("SLOW")) { setInterval(() => {}, 1000); return; }
  if (input.includes("FAIL")) {
    emit({ event: { type: "node_failed", nodeId: node.id, error: "model exploded", label: node.label } });
    emit({ result: { status: "failed", outputs: {}, outputs_by_name: {}, errors: ["Node " + node.id + " failed: model exploded"], failures: [{ nodeId: node.id, summary: "model exploded" }] } });
    return;
  }
  const scale = (node.params || {}).scale;
  const output = {
    success: true,
    image: { bytesBase64: b64("upscaled(" + prompt.resolution + ",x" + scale + "," + node.pluginId + "):" + input), mime: "image/png", filename: "up.png" },
  };
  emit({ event: { type: "node_completed", nodeId: node.id, output, label: node.label } });
  emit({ result: { status: "success", outputs: { [node.id]: output }, outputs_by_name: {}, errors: [], failures: [] } });
});
`;

/** The browser half's view of the registry: the same plugins, by runtime. */
const BROWSER_REGISTRY: ExecutorRegistry = {
    plugins: {
        "tongflow-local-upscale": {
            localSubdir: "tongflow-local-upscale",
            runtime: "python",
            methodsByNodeSlot: { "image-upscale": { methodName: "upscale" } },
        },
        "tongflow-api-paid": {
            localSubdir: "tongflow-api-paid",
            runtime: "python",
            methodsByNodeSlot: { "image-upscale": { methodName: "upscale" } },
        },
        "tongflow-edge-essentials": {
            localSubdir: "tongflow-edge-essentials",
            entryFile: "index.js",
            runtime: "browser",
            methodsByNodeSlot: {
                "image-orient": { methodName: "orient" },
                "detect-objects": { methodName: "detect" },
            },
        },
    },
};

const EDGE_PLUGIN = defineEdgePlugin({
    methods: {
        orient: edgeMethod("image-orient", async (input) => ({
            success: true,
            image: {
                bytesBase64: utf8ToBase64(
                    `oriented:${base64ToUtf8(input.image.bytesBase64)}`,
                ),
                mime: "image/png",
                filename: "oriented.png",
            },
        })),
        detect: edgeMethod("detect-objects", async (input) => ({
            success: true,
            objects: JSON.stringify({
                seen: base64ToUtf8(input.image.bytesBase64),
            }),
        })),
    },
});

const imageOut = (downstream: string) => ({
    sourceField: "image",
    nodeType: "imageNode",
    dataField: "fileKeys",
    expandEach: false,
    itemValuePath: "file_key",
    downstreamDataNodeId: downstream,
});

const handle = (fromNodeId: string, fromField: string) => ({
    kind: "handle",
    sources: [{ fromNodeId, fromField }],
    targetHandle: "in:image",
    consumerShape: "scalar",
});

/** photo → orient (browser) → upscale (server) → detect (browser). */
function mixedWorkflow(upscalePlugin: string): ExecutableWorkflow {
    return {
        name: "mixed",
        version: "1.0",
        exportedAt: "2026-01-01T00:00:00.000Z",
        inputs: [{ name: "photo", type: "image", nodeId: "photo" }],
        outputs: [
            { name: "upscaled", type: "image", nodeId: "up", field: "image" },
            { name: "objects", type: "text", nodeId: "det", field: "objects" },
        ],
        dataNodes: [
            {
                id: "photo",
                type: "imageNode",
                dataType: "image",
                isInput: true,
                inputName: "photo",
                level: 0,
            },
            { id: "mid", type: "imageNode", dataType: "image", level: 2 },
            { id: "big", type: "imageNode", dataType: "image", level: 4 },
            { id: "txt", type: "textNode", dataType: "text", level: 6 },
        ],
        executableNodes: [
            {
                id: "orient",
                type: "imageOrientNode",
                feature: "image-orient",
                pluginId: "tongflow-edge-essentials",
                label: "orient",
                bindings: { image: handle("photo", "fileKeys") },
                outputs: [imageOut("mid")],
                dependencies: ["photo"],
                level: 1,
            },
            {
                id: "up",
                type: "imageUpscaleNode",
                feature: "image-upscale",
                pluginId: upscalePlugin,
                label: "upscale",
                params: { scale: 2 },
                bindings: {
                    image: handle("orient", "image"),
                    resolution: { kind: "config", value: "2k" },
                },
                outputs: [imageOut("big")],
                dependencies: ["mid"],
                level: 3,
            },
            {
                id: "det",
                type: "detectObjectsNode",
                feature: "detect-objects",
                pluginId: "tongflow-edge-essentials",
                label: "detect",
                bindings: { image: handle("up", "image") },
                outputs: [
                    {
                        sourceField: "objects",
                        nodeType: "textNode",
                        dataField: "texts",
                        expandEach: false,
                        downstreamDataNodeId: "txt",
                    },
                ],
                dependencies: ["big"],
                level: 5,
            },
        ],
        executionLevels: [["orient"], ["up"], ["det"]],
        dataNodeEdges: [],
        originalFlow: { nodes: [], edges: [] },
    } as unknown as ExecutableWorkflow;
}

let root: string;
let fakePython: string;
let studio: Studio;
let server: StudioServer;
let origin: string;
let cookie: string;
let projectId: string;

class TestStudio extends Studio {
    override python(): Promise<string> {
        return Promise.resolve(fakePython);
    }
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tongflow-studio-remote-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "fake-python.cjs"), FAKE_PYTHON);
    fakePython = join(bin, "fake-python");
    await writeFile(
        fakePython,
        `#!/bin/sh\nexec "${process.execPath}" "${join(bin, "fake-python.cjs")}" "$@"\n`,
    );
    await chmod(fakePython, 0o755);
    studio = new TestStudio({
        config: studioConfig({
            studioRoot: root,
            autoInstallOfficial: false,
            maxConcurrentRuns: 2,
        }),
    });
    await studio.init();
    // A required API key makes the plugin bill the user (Studio's billing rule).
    await mkdir(join(studio.paths.plugins, "tongflow-api-paid"), {
        recursive: true,
    });
    await writeFile(
        join(studio.paths.plugins, "tongflow-api-paid", "tongflow.plugin.json"),
        JSON.stringify({ env: [{ key: "PAID_KEY", required: true }] }),
    );
    projectId = (await createProject(root, { title: "Mixed" })).id;
    const web = join(root, "web");
    await mkdir(web);
    await writeFile(join(web, "studio.js"), "export {};\n");
    server = await serveStudio({
        env: { studio, api: new StudioApi(studio) },
        webDir: web,
    });
    origin = `http://127.0.0.1:${server.port}`;
    const exchange = await fetch(server.url(), { redirect: "manual" });
    cookie = (exchange.headers.get("set-cookie") ?? "").split(";")[0];
});

afterEach(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
});

function base(): string {
    return `${origin}/tongflow/p/${projectId}`;
}

async function runMixed(
    options: {
        upscalePlugin?: string;
        photo?: string;
        headers?: Record<string, string>;
        confirm?: (c: RemoteConfirmation) => boolean;
        signal?: AbortSignal;
        onEvent?: (e: EngineEvent) => void;
    } = {},
) {
    const store = new MemoryAssetStore();
    const photo = await store.put(
        new TextEncoder().encode(options.photo ?? "PHOTO"),
        { ext: "png", mime: "image/png", filename: "photo.png" },
    );
    const events: EngineEvent[] = [];
    const result = await runWorkflow(
        mixedWorkflow(options.upscalePlugin ?? "tongflow-local-upscale"),
        {
            executor: createCompositeExecutor({
                registry: BROWSER_REGISTRY,
                edge: createInProcessEdgeExecutor({
                    registry: BROWSER_REGISTRY,
                    loadPlugin: () => EDGE_PLUGIN,
                }),
                remote: createHttpRemoteExecutor({
                    baseUrl: base(),
                    headers: options.headers ?? { cookie },
                    ...(options.confirm ? { confirm: options.confirm } : {}),
                }),
            }),
            store,
            inputs: { photo: [photo.file_key] },
            ...(options.signal ? { signal: options.signal } : {}),
            onEvent: (e) => {
                events.push(e);
                options.onEvent?.(e);
            },
        },
    );
    return { result, store, events, photo };
}

async function bytesOf(store: MemoryAssetStore, key: string) {
    return new TextDecoder().decode((await store.get(key)) ?? undefined);
}

async function lastEngineRequest() {
    return JSON.parse(
        await readFile(join(root, "bin", "last-request.json"), "utf8"),
    ) as {
        workflow: {
            executableNodes: { params?: unknown; bindings: unknown }[];
        };
        options: { inline_outputs: boolean };
    };
}

describe("mixed graph: browser engine + Studio remote executor", () => {
    it("runs edge nodes in process and the Python node on the Studio server", async () => {
        const { result, store, events } = await runMixed();
        expect(result.errors).toEqual([]);
        expect(result.status).toBe("success");

        // The server node's output came back as bytes and now lives in the
        // browser store under a browser key.
        const [upKey] = result.outputsByName.upscaled;
        expect(store.owns(upKey)).toBe(true);
        expect(await bytesOf(store, upKey)).toBe(
            "upscaled(2k,x2,tongflow-local-upscale):oriented:PHOTO",
        );
        // ...and the next edge node read it from there.
        expect(JSON.parse(result.outputsByName.objects[0])).toEqual({
            seen: "upscaled(2k,x2,tongflow-local-upscale):oriented:PHOTO",
        });

        // The server got the materialized asset, the config and _params, and
        // ran with inline outputs.
        const req = await lastEngineRequest();
        expect(req.options.inline_outputs).toBe(true);
        expect(req.workflow.executableNodes[0].params).toEqual({ scale: 2 });
        expect(req.workflow.executableNodes[0].bindings).toMatchObject({
            image: {
                kind: "static",
                value: { bytesBase64: utf8ToBase64("oriented:PHOTO") },
            },
            resolution: { kind: "static", value: "2k" },
        });

        // Server progress reached the browser engine as the node's progress.
        expect(events).toContainEqual({
            type: "plugin_progress",
            nodeId: "up",
            pluginId: "tongflow-local-upscale",
            message: "upscaling",
            percent: 50,
        });

        // Nothing was written into the project.
        const runs = studio.runs.list(projectId);
        expect(runs).toHaveLength(1);
        expect(runs[0].workflow).toBe("invoke image-upscale");
        expect(runs[0].status).toBe("completed");
        expect(runs[0].files).toEqual([]);
    });

    it("a plugin failure on the server fails that node with the plugin's message", async () => {
        const { result, events } = await runMixed({ photo: "FAIL" });
        expect(result.status).toBe("failed");
        expect(result.failures).toEqual([
            { nodeId: "up", summary: "model exploded" },
        ]);
        expect(
            events.some((e) => e.type === "node_started" && e.nodeId === "det"),
        ).toBe(false);
    });

    describe("billing checkpoint", () => {
        it("a paid plugin fails the node with needs_confirmation when nobody confirms", async () => {
            const { result } = await runMixed({
                upscalePlugin: "tongflow-api-paid",
            });
            expect(result.status).toBe("failed");
            expect(result.failures[0].nodeId).toBe("up");
            expect(result.failures[0].summary).toMatch(
                /^Plugin tongflow-api-paid \(nodeSlot=image-upscale\) bills you \(api: Calls a paid API with your own key \(PAID_KEY\)/,
            );
            // The server never started a run.
            expect(studio.runs.list(projectId)).toHaveLength(0);
        });

        it("runs once the user agrees, and asks again next time", async () => {
            const asked: RemoteConfirmation[] = [];
            const confirm = (c: RemoteConfirmation) => {
                asked.push(c);
                return true;
            };
            const first = await runMixed({
                upscalePlugin: "tongflow-api-paid",
                confirm,
            });
            expect(first.result.status).toBe("success");
            const second = await runMixed({
                upscalePlugin: "tongflow-api-paid",
                confirm,
            });
            expect(second.result.status).toBe("success");
            expect(asked).toHaveLength(2);
            expect(asked[0]).toMatchObject({
                pluginId: "tongflow-api-paid",
                nodeSlot: "image-upscale",
                billing: "api",
            });
        });
    });

    it("the studio's auth applies: without the cookie the node fails", async () => {
        const { result } = await runMixed({ headers: {} });
        expect(result.status).toBe("failed");
        expect(result.failures[0].nodeId).toBe("up");
        expect(studio.runs.list(projectId)).toHaveLength(0);
    });

    it("cancelling the browser run stops the server run", async () => {
        const abort = new AbortController();
        const { result, events } = await runMixed({
            photo: "SLOW",
            signal: abort.signal,
            onEvent: (e) => {
                if (e.type === "plugin_progress" && e.nodeId === "up")
                    abort.abort();
            },
        });
        expect(result.status).toBe("cancelled");
        expect(events).toContainEqual({
            type: "node_cancelled",
            nodeId: "up",
            label: "upscale",
        });
        const [run] = studio.runs.list(projectId);
        const record = studio.runs.get(run.runId);
        await record?.done;
        expect(record?.summary.status).toBe("cancelled");
    });

    it("refuses browser plugins and unknown plugins before running anything", async () => {
        const post = (body: unknown) =>
            fetch(`${base()}/api/engine/invoke`, {
                method: "POST",
                headers: { cookie, "content-type": "application/json" },
                body: JSON.stringify(body),
            });
        const browser = await post({
            pluginId: "tongflow-edge-essentials",
            nodeSlot: "image-orient",
            prompt: {},
        });
        expect(browser.status).toBe(400);
        expect(await browser.json()).toMatchObject({ code: "browser_plugin" });
        const missing = await post({
            pluginId: "tongflow-local-nope",
            nodeSlot: "image-upscale",
            prompt: {},
        });
        expect(missing.status).toBe(400);
        expect(await missing.json()).toMatchObject({
            code: "plugin_not_installed",
        });
        const bad = await post({ pluginId: "tongflow-local-upscale" });
        expect(bad.status).toBe(400);
        expect(await bad.json()).toMatchObject({ code: "invalid_request" });
        const stop = await fetch(`${base()}/api/engine/invoke/stop`, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ invocationId: "run-nope" }),
        });
        expect(stop.status).toBe(404);
        expect(studio.runs.list(projectId)).toHaveLength(0);
    });
});
