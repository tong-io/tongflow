import { execFile as execFileCb } from "node:child_process";
import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { ExecutableWorkflow } from "tongflow";
import type { CanvasTaskTransport } from "tongflow/canvas";
import {
    createInProcessEdgeExecutor,
    type ExecutorRegistry,
    type RemoteConfirmation,
} from "tongflow/engine";
import type { CanvasWorkflowRunEvent } from "tongflow/engine/canvas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioApi } from "../src/api.ts";
import {
    BROWSER_OUTPUT_DIR,
    loadStudioEdgeRuntime,
} from "../src/client/edge-runtime.ts";
import { studioConfig } from "../src/config.ts";
import {
    pluginFileMime,
    resolvePluginFile,
    safePluginPath,
} from "../src/http/plugin-files.ts";
import { createProject } from "../src/project/manifest.ts";
import { type StudioServer, serveStudio } from "../src/serve.ts";
import type { EdgePluginsInfo } from "../src/shared/types.ts";
import { Studio } from "../src/studio.ts";

const execFile = promisify(execFileCb);

/**
 * A stand-in for `python`, as in remote-executor.test.ts. `-m tongflow scan`
 * lists two Python plugins plus every `tongflow-edge-*` directory that has a
 * manifest (as the real scanner does: runtime "browser", slots from the
 * manifest); `-m tongflow engine` plays the Python upscaler.
 */
const FAKE_PYTHON = String.raw`
const fs = require("fs"), path = require("path");
const args = process.argv.slice(2);
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s) => Buffer.from(s, "base64").toString("utf8");
if (args[2] === "scan") {
  const root = args[args.indexOf("--root") + 1];
  const plugins = {
    "tongflow-local-upscale": { localSubdir: "tongflow-local-upscale", entryFile: "entry.py", runtime: "python", methodsByNodeSlot: { "image-upscale": { methodName: "upscale" } } },
    "tongflow-api-paid": { localSubdir: "tongflow-api-paid", entryFile: "entry.py", runtime: "python", methodsByNodeSlot: { "image-upscale": { methodName: "upscale" } } },
  };
  const nodePluginMap = { "image-upscale": ["tongflow-local-upscale", "tongflow-api-paid"] };
  for (const id of fs.readdirSync(root)) {
    const manifest = path.join(root, id, "tongflow.plugin.json");
    if (!id.startsWith("tongflow-edge-") || !fs.existsSync(manifest)) continue;
    const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const methodsByNodeSlot = {};
    for (const s of m.slots) {
      methodsByNodeSlot[s.nodeSlot] = { methodName: s.method, ...(s.models ? { models: s.models } : {}) };
      (nodePluginMap[s.nodeSlot] = nodePluginMap[s.nodeSlot] || []).push(id);
    }
    plugins[id] = { localSubdir: id, entryFile: m.entry, runtime: "browser", methodsByNodeSlot };
  }
  process.stdout.write(JSON.stringify({ version: 1, generatedAt: "2026-01-01T00:00:00Z", nodePluginMap, plugins }));
  process.exit(0);
}
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  const req = JSON.parse(raw);
  const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  emit({ ready: { version: "test" } });
  const node = req.workflow.executableNodes[0];
  const prompt = {};
  for (const [k, b] of Object.entries(node.bindings)) prompt[k] = b.value;
  emit({ event: { type: "node_started", nodeId: node.id, level: 1, feature: node.feature, label: node.label } });
  const output = {
    success: true,
    image: { bytesBase64: b64("upscaled(" + node.pluginId + "):" + unb64(prompt.image.bytesBase64)), mime: "image/png", filename: "up.png" },
  };
  emit({ event: { type: "node_completed", nodeId: node.id, output, label: node.label } });
  emit({ result: { status: "success", outputs: { [node.id]: output }, outputs_by_name: {}, errors: [], failures: [] } });
});
`;

const EDGE_ID = "tongflow-edge-fixture";

/** A tiny browser plugin: one slot, a self-contained ESM entry, a wasm asset. */
const FIXTURE = {
    "tongflow.plugin.json": JSON.stringify({
        plugin: { name: "Edge fixture" },
        runtime: "browser",
        entry: "dist/index.js",
        slots: [
            {
                nodeSlot: "image-orient",
                method: "orient",
                models: ["tiny-ori", "huge-ori"],
            },
        ],
    }),
    "package.json": JSON.stringify({ name: EDGE_ID, version: "0.0.1" }),
    "models.json": JSON.stringify([
        { id: "tiny-ori", approxMB: 5 },
        { id: "huge-ori", approxMB: 700 },
    ]),
    "dist/index.js": `export default {
    methods: {
        orient: async (input, ctx) => {
            ctx.progress("orienting", 50);
            const text = new TextDecoder().decode(Uint8Array.from(atob(input.image.bytesBase64), (c) => c.charCodeAt(0)));
            return { success: true, image: { bytesBase64: btoa("oriented(" + (ctx.model ?? "default") + "):" + text), mime: "image/png", filename: "oriented.png" } };
        },
    },
};
`,
    "dist/assets/ort.wasm": "\0asm-bytes-0123456789",
    "dist/chunks/a-1234.mjs": "export const a = 1;\n",
    "README.html": "<script>alert(1)</script>",
    ".env": "SECRET=1",
};

let root: string;
let fakePython: string;
let studio: Studio;
let server: StudioServer;
let origin: string;
let cookie: string;
let projectId: string;
let fixtureDir: string;

class TestStudio extends Studio {
    override python(): Promise<string> {
        return Promise.resolve(fakePython);
    }
}

async function writeTree(dir: string, files: Record<string, string>) {
    for (const [rel, content] of Object.entries(files)) {
        await mkdir(join(dir, rel, ".."), { recursive: true });
        await writeFile(join(dir, rel), content);
    }
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tongflow-studio-edge-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "fake-python.cjs"), FAKE_PYTHON);
    fakePython = join(bin, "fake-python");
    await writeFile(
        fakePython,
        `#!/bin/sh\nexec "${process.execPath}" "${join(bin, "fake-python.cjs")}" "$@"\n`,
    );
    await chmod(fakePython, 0o755);
    // The fixture plugin is a local git repo, installed like any plugin.
    fixtureDir = join(root, "src", EDGE_ID);
    await writeTree(fixtureDir, FIXTURE);
    const git = (...a: string[]) =>
        execFile("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], {
            cwd: fixtureDir,
        });
    await git("init", "-q");
    await git("add", "-A");
    await git("commit", "-q", "-m", "fixture");

    studio = new TestStudio({
        config: studioConfig({
            studioRoot: root,
            autoInstallOfficial: false,
            edgeModelBase: "https://models.example/",
        }),
    });
    await studio.init();
    await mkdir(join(studio.paths.plugins, "tongflow-api-paid"), {
        recursive: true,
    });
    await writeFile(
        join(studio.paths.plugins, "tongflow-api-paid", "tongflow.plugin.json"),
        JSON.stringify({ env: [{ key: "PAID_KEY", required: true }] }),
    );
    projectId = (await createProject(root, { title: "Edge" })).id;
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

const api = (path: string, init: RequestInit = {}) =>
    fetch(`${origin}/tongflow${path}`, {
        ...init,
        headers: { cookie, ...(init.headers as Record<string, string>) },
    });

async function install(): Promise<EdgePluginsInfo> {
    const res = await api("/plugins/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idOrUrl: pathToFileURL(fixtureDir).href }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: EDGE_ID });
    return (await (await api("/plugins/edge")).json()) as EdgePluginsInfo;
}

describe("plugin file helpers", () => {
    it("refuses traversal, dot-segments and odd paths", () => {
        expect(safePluginPath("dist/index.js")).toBe("dist/index.js");
        for (const bad of [
            "",
            "../x",
            "dist/../../x",
            "./dist/index.js",
            ".git/config",
            "dist/.hidden",
            "/etc/passwd",
            "dist//index.js",
            "dist\\index.js",
            "a\0b",
        ])
            expect(safePluginPath(bad)).toBeNull();
    });

    it("resolves only regular files inside the plugin dir, also through symlinks", async () => {
        const dir = join(root, "p");
        await writeTree(dir, { "dist/index.js": "x", "dist/sub/y.js": "y" });
        await writeFile(join(root, "outside.txt"), "secret");
        await symlink(join(root, "outside.txt"), join(dir, "dist", "leak.js"));
        expect(await resolvePluginFile(dir, "dist/index.js")).toMatch(
            /dist\/index\.js$/,
        );
        expect(await resolvePluginFile(dir, "dist/leak.js")).toBeNull();
        expect(await resolvePluginFile(dir, "dist/sub")).toBeNull();
        expect(await resolvePluginFile(dir, "dist/missing.js")).toBeNull();
        // A plugin dir that is itself a symlink (a local checkout linked in) works.
        await symlink(dir, join(root, "linked"));
        expect(
            await resolvePluginFile(join(root, "linked"), "dist/index.js"),
        ).not.toBeNull();
    });

    it("maps the MIME types the edge runtime needs", () => {
        expect(pluginFileMime("a.wasm")).toBe("application/wasm");
        expect(pluginFileMime("dist/index.js")).toBe(
            "text/javascript; charset=utf-8",
        );
        expect(pluginFileMime("x.MJS")).toBe("text/javascript; charset=utf-8");
        expect(pluginFileMime("models.json")).toBe(
            "application/json; charset=utf-8",
        );
        expect(pluginFileMime("w.onnx")).toBe("application/octet-stream");
        expect(pluginFileMime("README.html")).toBe("text/plain; charset=utf-8");
    });
});

describe("edge plugin routes", () => {
    it("lists nothing before a browser plugin is installed", async () => {
        const res = await api("/plugins/edge");
        expect(await res.json()).toEqual({
            modelBase: "https://models.example/",
            crossOriginIsolated: false,
            plugins: {},
        });
    });

    it("serves the installed plugin: versioned URLs, MIME, Range, caching", async () => {
        const info = await install();
        const p = info.plugins[EDGE_ID];
        expect(p.version).toMatch(/^[0-9a-f]{12}$/);
        expect(p.base).toBe(`/tongflow/plugins/files/${EDGE_ID}/${p.version}/`);
        expect(p.entryUrl).toBe(`${p.base}dist/index.js`);
        expect(p.modelsUrl).toBe(`${p.base}models.json`);

        const entry = await fetch(`${origin}${p.entryUrl}`, {
            headers: { cookie },
        });
        expect(entry.status).toBe(200);
        expect(entry.headers.get("content-type")).toBe(
            "text/javascript; charset=utf-8",
        );
        expect(entry.headers.get("cache-control")).toBe(
            "public, max-age=31536000, immutable",
        );
        expect(entry.headers.get("x-content-type-options")).toBe("nosniff");
        expect(await entry.text()).toContain("oriented(");

        const wasm = await fetch(`${origin}${p.base}dist/assets/ort.wasm`, {
            headers: { cookie },
        });
        expect(wasm.headers.get("content-type")).toBe("application/wasm");
        expect(wasm.headers.get("accept-ranges")).toBe("bytes");

        const part = await fetch(`${origin}${p.base}dist/assets/ort.wasm`, {
            headers: { cookie, range: "bytes=0-0" },
        });
        expect(part.status).toBe(206);
        expect(part.headers.get("content-range")).toBe("bytes 0-0/21");
        expect(await part.text()).toBe("\0");
        const tail = await fetch(`${origin}${p.base}dist/assets/ort.wasm`, {
            headers: { cookie, range: "bytes=-4" },
        });
        expect(await tail.text()).toBe("6789");
        const bad = await fetch(`${origin}${p.base}dist/assets/ort.wasm`, {
            headers: { cookie, range: "bytes=99-" },
        });
        expect(bad.status).toBe(416);
        expect(bad.headers.get("content-range")).toBe("bytes */21");

        // HTML is never rendered on the studio's origin.
        const html = await fetch(`${origin}${p.base}README.html`, {
            headers: { cookie },
        });
        expect(html.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
        );

        // An update is a new version; the old URL is no longer cacheable.
        await writeFile(
            join(studio.paths.plugins, EDGE_ID, "dist", "index.js"),
            `${FIXTURE["dist/index.js"]}// v2\n`,
        );
        const next = (await (
            await api("/plugins/edge")
        ).json()) as EdgePluginsInfo;
        expect(next.plugins[EDGE_ID].version).not.toBe(p.version);
        const stale = await fetch(`${origin}${p.entryUrl}`, {
            headers: { cookie },
        });
        expect(stale.headers.get("cache-control")).toBe("no-cache");
        expect(await stale.text()).toContain("// v2");
    });

    it("refuses traversal, hidden files, Python plugins and the unauthenticated", async () => {
        const info = await install();
        const { base } = info.plugins[EDGE_ID];
        const status = async (path: string, withCookie = true) =>
            (
                await fetch(`${origin}${path}`, {
                    headers: withCookie ? { cookie } : {},
                })
            ).status;
        await writeFile(join(root, "secret.txt"), "secret");
        expect(await status(`${base}..%2F..%2F..%2Fsecret.txt`)).toBe(404);
        expect(await status(`${base}dist/%2E%2E/%2E%2E/package.json`)).toBe(
            404,
        );
        expect(await status(`${base}.env`)).toBe(404);
        expect(await status(`${base}.git/config`)).toBe(404);
        expect(await status(`${base}dist`)).toBe(404);
        expect(
            await status(
                "/tongflow/plugins/files/tongflow-api-paid/x/tongflow.plugin.json",
            ),
        ).toBe(404);
        expect(
            await status("/tongflow/plugins/files/tongflow-edge-none/x/a.js"),
        ).toBe(404);
        expect(await status(`${base}dist/index.js`, false)).toBe(401);
    });

    it("adds COEP to plugin files when the studio is cross-origin isolated", async () => {
        await server.close();
        studio = new TestStudio({
            config: studioConfig({
                studioRoot: root,
                autoInstallOfficial: false,
                crossOriginIsolation: true,
            }),
        });
        server = await serveStudio({
            env: { studio, api: new StudioApi(studio) },
            webDir: join(root, "web"),
        });
        origin = `http://127.0.0.1:${server.port}`;
        const exchange = await fetch(server.url(), { redirect: "manual" });
        cookie = (exchange.headers.get("set-cookie") ?? "").split(";")[0];
        const page = await fetch(`${origin}/`, { headers: { cookie } });
        expect(page.headers.get("cross-origin-opener-policy")).toBe(
            "same-origin",
        );
        expect(page.headers.get("cross-origin-embedder-policy")).toBe(
            "require-corp",
        );
        const info = await install();
        expect(info.crossOriginIsolated).toBe(true);
        const entry = await fetch(
            `${origin}${info.plugins[EDGE_ID].entryUrl}`,
            { headers: { cookie } },
        );
        expect(entry.headers.get("cross-origin-embedder-policy")).toBe(
            "require-corp",
        );
    });
});

/* ---------------- the canvas runner wiring ---------------- */

const fallback: CanvasTaskTransport = {
    createTask: vi.fn(async () => ({ taskId: "server-task" })),
    waitTask: vi.fn(() => ({ close: () => {} })),
    stopTask: vi.fn(async () => true),
    updateTaskStatus: vi.fn(async () => ({ success: true })),
};

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

/** An uploaded photo (server key) → orient (browser) → upscale (server, paid). */
function mixedWorkflow(photoKey: string, model?: string): ExecutableWorkflow {
    return {
        name: "mixed",
        version: "1.0",
        exportedAt: "2026-01-01T00:00:00.000Z",
        inputs: [],
        outputs: [],
        dataNodes: [
            {
                id: "photo",
                type: "imageNode",
                dataType: "image",
                level: 0,
                staticData: { fileKeys: [photoKey] },
            },
            { id: "mid", type: "imageNode", dataType: "image", level: 2 },
            { id: "big", type: "imageNode", dataType: "image", level: 4 },
        ],
        executableNodes: [
            {
                id: "orient",
                type: "imageOrientNode",
                feature: "image-orient",
                pluginId: EDGE_ID,
                ...(model ? { model } : {}),
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
                pluginId: "tongflow-api-paid",
                label: "upscale",
                bindings: {
                    image: handle("orient", "image"),
                    resolution: { kind: "config", value: "2k" },
                },
                outputs: [imageOut("big")],
                dependencies: ["mid"],
                level: 3,
            },
        ],
        executionLevels: [["orient"], ["up"]],
        dataNodeEdges: [],
        originalFlow: { nodes: [], edges: [] },
    } as unknown as ExecutableWorkflow;
}

/**
 * The edge executor of the test: the plugin entry is fetched from the route
 * the Web Worker would load it from, then imported in process (Node has no
 * Worker).
 */
function servedEdge(info: EdgePluginsInfo, registry: ExecutorRegistry) {
    return createInProcessEdgeExecutor({
        registry,
        loadPlugin: async (id) => {
            const res = await fetch(`${origin}${info.plugins[id].entryUrl}`, {
                headers: { cookie },
            });
            const file = join(root, `${id}-entry.mjs`);
            await writeFile(file, await res.text());
            return import(pathToFileURL(file).href);
        },
    });
}

async function projectFile(key: string): Promise<string> {
    const ref = await studio.project(projectId);
    return readFile(join(ref.root, key), "utf8");
}

describe("Studio canvas runner wiring (browser edge runtime)", () => {
    it("is absent without a browser plugin: the canvas stays as it was", async () => {
        const rt = await loadStudioEdgeRuntime({
            pid: projectId,
            origin,
            headers: { cookie },
            fallbackTransport: fallback,
            confirmPaid: async () => true,
            confirmDownload: async () => true,
        });
        expect(rt).toBeNull();
    });

    it("runs a mixed workflow: server file in, edge node, paid server node, outputs in the project", async () => {
        const info = await install();
        const form = new FormData();
        form.append("file", new Blob(["PHOTO"]), "photo.png");
        const up = await api(`/p/${projectId}/upload`, {
            method: "POST",
            body: form,
        });
        const [{ key: photoKey }] = (
            (await up.json()) as {
                files: { key: string }[];
            }
        ).files;
        expect(photoKey).toBe("uploads/photo.png");

        const paid: RemoteConfirmation[] = [];
        const downloads: string[] = [];
        const registry = (await (
            await api(`/p/${projectId}/api/plugins/registry`)
        ).json()) as ExecutorRegistry;
        const rt = await loadStudioEdgeRuntime({
            pid: projectId,
            origin,
            headers: { cookie },
            fallbackTransport: fallback,
            confirmPaid: async (c) => {
                paid.push(c);
                return true;
            },
            confirmDownload: async (r) => {
                downloads.push(r.label);
                return false;
            },
            edge: servedEdge(info, registry),
        });
        expect(rt).not.toBeNull();
        if (!rt) return;
        expect(rt.info.modelBase).toBe("https://models.example/");

        const events: CanvasWorkflowRunEvent[] = [];
        await rt.runner.run(mixedWorkflow(photoKey), {
            signal: new AbortController().signal,
            onEvent: (e) => events.push(e),
        });
        expect(events.at(-1)).toEqual({ type: "run-done", ok: true });
        const done = (id: string) =>
            events.find((e) => e.type === "node-done" && e.nodeId === id) as
                | { output: { image: { file_key: string } } }
                | undefined;

        // The edge node read the uploaded file from the server and its output
        // was uploaded back into the project under a project key...
        const mid = done("orient")?.output.image.file_key ?? "";
        expect(mid.startsWith(`${BROWSER_OUTPUT_DIR}/oriented-`)).toBe(true);
        expect(mid.endsWith(".png")).toBe(true);
        expect(await projectFile(mid)).toBe("oriented(default):PHOTO");
        // ...the paid Python node asked first, got those bytes, and its
        // result is a project file too.
        expect(paid).toEqual([
            expect.objectContaining({
                pluginId: "tongflow-api-paid",
                nodeSlot: "image-upscale",
                billing: "api",
            }),
        ]);
        const big = done("up")?.output.image.file_key ?? "";
        expect(big.startsWith(`${BROWSER_OUTPUT_DIR}/up-`)).toBe(true);
        expect(await projectFile(big)).toBe(
            "upscaled(tongflow-api-paid):oriented(default):PHOTO",
        );
        expect(downloads).toEqual([]);

        // A large model asks first; declining fails only that branch.
        const declined: CanvasWorkflowRunEvent[] = [];
        await rt.runner.run(mixedWorkflow(photoKey, "huge-ori"), {
            signal: new AbortController().signal,
            onEvent: (e) => declined.push(e),
        });
        expect(downloads).toEqual(["huge-ori (≈700 MB)"]);
        expect(declined).toContainEqual({
            type: "node-error",
            nodeId: "orient",
            message: expect.stringContaining("you declined huge-ori"),
        });
        expect(declined).toContainEqual({
            type: "node-skipped",
            nodeId: "up",
            reason: "upstream failed",
        });

        // Single-node "Run" of the edge node goes through the engine too;
        // a Python node keeps the server path.
        const { taskId } = await rt.taskTransport.createTask({
            feature: "image-orient",
            pluginId: EDGE_ID,
            model: "tiny-ori",
            prompt: { image: photoKey },
            nodeId: "orient",
        });
        const messages = await new Promise<
            { status: string; data?: unknown }[]
        >((resolve) => {
            const all: { status: string; data?: unknown }[] = [];
            rt.taskTransport.waitTask(taskId, {
                onOpen: () => {},
                onMessage: (m) => all.push(m),
                onClose: () => resolve(all),
                onError: () => {},
            });
        });
        const last = messages.at(-1) as {
            status: string;
            data: { image: { file_key: string } };
        };
        expect(last.status).toBe("COMPLETED");
        expect(await projectFile(last.data.image.file_key)).toBe(
            "oriented(tiny-ori):PHOTO",
        );
        await rt.taskTransport.createTask({
            feature: "image-upscale",
            pluginId: "tongflow-local-upscale",
            prompt: { image: photoKey },
            nodeId: "up",
        });
        expect(fallback.createTask).toHaveBeenCalledTimes(1);
        rt.dispose();
    });
});
