import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginsRegistry } from "tongflow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
    edgePluginFileMime,
    edgePluginsInfo,
    resolvePluginFile,
    safePluginPath,
    serveEdgePluginFile,
} = await import("./edge-plugin-files.server");

const ID = "tongflow-edge-fixture";

let root: string;
let pluginsDir: string;
const registry: Pick<PluginsRegistry, "plugins"> = {
    plugins: {
        [ID]: {
            localSubdir: ID,
            entryFile: "dist/index.js",
            runtime: "browser",
            methodsByNodeSlot: { "image-orient": { methodName: "orient" } },
        },
        "tongflow-api-x": {
            localSubdir: "tongflow-api-x",
            entryFile: "entry.py",
            runtime: "python",
            methodsByNodeSlot: { "gen-text": { methodName: "gen" } },
        },
    },
};

async function put(rel: string, content: string) {
    await mkdir(join(pluginsDir, rel, ".."), { recursive: true });
    await writeFile(join(pluginsDir, rel), content);
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tongflow-edge-files-"));
    pluginsDir = join(root, "plugins");
    await put(`${ID}/tongflow.plugin.json`, "{}");
    await put(`${ID}/models.json`, "[]");
    await put(`${ID}/dist/index.js`, "export default {};\n");
    await put(`${ID}/dist/assets/ort.wasm`, "\0asm0123456789");
    await put(`${ID}/.env`, "SECRET=1");
    await put("tongflow-api-x/entry.py", "print(1)");
    await writeFile(join(root, "secret.txt"), "secret");
    delete process.env.TONGFLOW_CROSS_ORIGIN_ISOLATION;
    delete process.env.TONGFLOW_EDGE_MODEL_BASE;
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function info() {
    return edgePluginsInfo(registry, pluginsDir);
}

function get(path: string, headers: Record<string, string> = {}) {
    // Segments as Next hands them to the catch-all route: already decoded.
    const segments = path.split("/").map(decodeURIComponent);
    return serveEdgePluginFile(
        new Request(`http://app.local/api/plugins/files/${path}`, { headers }),
        segments,
        registry,
        pluginsDir,
    );
}

describe("edge plugin info", () => {
    it("lists browser plugins only, with versioned URLs and the model base", async () => {
        process.env.TONGFLOW_EDGE_MODEL_BASE = "https://models.example/";
        const i = await info();
        expect(Object.keys(i.plugins)).toEqual([ID]);
        const p = i.plugins[ID];
        expect(p.version).toMatch(/^[0-9a-f]{12}$/);
        expect(p.base).toBe(`/api/plugins/files/${ID}/${p.version}/`);
        expect(p.entryUrl).toBe(`${p.base}dist/index.js`);
        expect(p.modelsUrl).toBe(`${p.base}models.json`);
        expect(i.modelBase).toBe("https://models.example/");
        expect(i.crossOriginIsolated).toBe(false);
    });

    it("defaults to the public model base", async () => {
        expect((await info()).modelBase).toBe("https://models.ctsource.cn/");
    });
});

describe("GET /api/plugins/files/…", () => {
    it("serves the entry and wasm with their MIME types, immutable for the current version", async () => {
        const { version } = (await info()).plugins[ID];
        const entry = await get(`${ID}/${version}/dist/index.js`);
        expect(entry.status).toBe(200);
        expect(entry.headers.get("content-type")).toBe(
            "text/javascript; charset=utf-8",
        );
        expect(entry.headers.get("cache-control")).toBe(
            "public, max-age=31536000, immutable",
        );
        expect(entry.headers.get("x-content-type-options")).toBe("nosniff");
        expect(await entry.text()).toBe("export default {};\n");
        const wasm = await get(`${ID}/${version}/dist/assets/ort.wasm`);
        expect(wasm.headers.get("content-type")).toBe("application/wasm");
        expect(wasm.headers.get("accept-ranges")).toBe("bytes");
        expect(edgePluginFileMime("a.mjs")).toBe(
            "text/javascript; charset=utf-8",
        );
        expect(edgePluginFileMime("w.onnx")).toBe("application/octet-stream");
        expect(edgePluginFileMime("x.html")).toBe("text/plain; charset=utf-8");
    });

    it("answers Range requests (206 / 416)", async () => {
        const { version } = (await info()).plugins[ID];
        const url = `${ID}/${version}/dist/assets/ort.wasm`;
        const first = await get(url, { range: "bytes=0-0" });
        expect(first.status).toBe(206);
        expect(first.headers.get("content-range")).toBe("bytes 0-0/14");
        expect(first.headers.get("content-length")).toBe("1");
        expect(await first.text()).toBe("\0");
        const tail = await get(url, { range: "bytes=-4" });
        expect(await tail.text()).toBe("6789");
        const open = await get(url, { range: "bytes=10-" });
        expect(await open.text()).toBe("6789");
        const bad = await get(url, { range: "bytes=50-" });
        expect(bad.status).toBe(416);
        expect(bad.headers.get("content-range")).toBe("bytes */14");
        expect((await get(url, { range: "lines=1" })).status).toBe(416);
    });

    it("a stale version still gets the current file, never cached", async () => {
        const { version } = (await info()).plugins[ID];
        await put(`${ID}/dist/index.js`, "export default { v: 2 };\n");
        const next = (await info()).plugins[ID].version;
        expect(next).not.toBe(version);
        const stale = await get(`${ID}/${version}/dist/index.js`);
        expect(stale.headers.get("cache-control")).toBe("no-cache");
        expect(await stale.text()).toContain("v: 2");
    });

    it("refuses traversal, hidden files, directories, symlinks out and Python plugins", async () => {
        const { version } = (await info()).plugins[ID];
        await symlink(
            join(root, "secret.txt"),
            join(pluginsDir, ID, "dist", "leak.js"),
        );
        for (const path of [
            `${ID}/${version}/..%2F..%2Fsecret.txt`,
            `${ID}/${version}/dist/..%2F..%2F..%2Fsecret.txt`,
            `${ID}/${version}/.env`,
            `${ID}/${version}/dist`,
            `${ID}/${version}/dist/leak.js`,
            `${ID}/${version}/dist/missing.js`,
            `${ID}/${version}`,
            "tongflow-api-x/v/entry.py",
            "tongflow-edge-none/v/dist/index.js",
        ])
            expect((await get(path)).status, path).toBe(404);
    });

    it("adds COEP when the app is cross-origin isolated", async () => {
        process.env.TONGFLOW_CROSS_ORIGIN_ISOLATION = "1";
        const { version } = (await info()).plugins[ID];
        const entry = await get(`${ID}/${version}/dist/index.js`);
        expect(entry.headers.get("cross-origin-embedder-policy")).toBe(
            "require-corp",
        );
    });
});

describe("path helpers", () => {
    it("rejects unsafe relative paths", () => {
        expect(safePluginPath("dist/index.js")).toBe("dist/index.js");
        for (const bad of [
            "",
            "../x",
            "a/../b",
            ".git/HEAD",
            "/abs",
            "a//b",
            "a\\b",
        ])
            expect(safePluginPath(bad), bad).toBeNull();
    });

    it("resolves through a symlinked plugin directory", async () => {
        await symlink(join(pluginsDir, ID), join(root, "linked"));
        expect(
            await resolvePluginFile(join(root, "linked"), "dist/index.js"),
        ).not.toBeNull();
    });
});
