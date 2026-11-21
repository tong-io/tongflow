import { describe, expect, it } from "vitest";
import type { PluginsRegistry } from "../core/registry/plugins-registry-schema";
import type { ExecutableWorkflow } from "../core/workflow/executable-workflow";
import { base64ToUtf8, utf8ToBase64 } from "./base64";
import { createConsentGate } from "./consent-gate";
import { createInProcessEdgeExecutor } from "./executors/in-process";
import { createHostAssetStore } from "./host-store";
import { runWorkflow } from "./run-workflow";
import type { InvokeRequest, NodeExecutor } from "./types";
import { defineEdgePlugin, edgeMethod } from "./worker/define-edge-plugin";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null);

function fakeHost() {
    const files = new Map<string, Uint8Array>([
        ["uploads/a.txt", enc("hello")],
    ]);
    const fetched: string[] = [];
    const store = createHostAssetStore({
        resolveUrl: (key) =>
            key.startsWith("opfs://") ? null : `/files/${key}`,
        // The Studio layout: `<dir>/<id>/<name>`, else `<dir>/<id>.<ext>`.
        upload: async (bytes, { id, name, ext }) => {
            const key = name
                ? `.runs/browser/${id}/${name}`
                : `.runs/browser/${id}.${ext}`;
            files.set(key, bytes);
            return key;
        },
        fetch: async (url) => {
            fetched.push(url);
            const bytes = files.get(url.replace(/^\/files\//, ""));
            return bytes
                ? new Response(bytes as Uint8Array<ArrayBuffer>)
                : new Response("missing", { status: 404 });
        },
        cacheBytes: 8,
    });
    return { store, files, fetched };
}

describe("createHostAssetStore", () => {
    it("reads host keys over HTTP and caches them", async () => {
        const { store, fetched } = fakeHost();
        expect(dec(await store.get("uploads/a.txt"))).toBe("hello");
        expect(dec(await store.get("uploads/a.txt"))).toBe("hello");
        expect(fetched).toEqual(["/files/uploads/a.txt"]);
        expect(store.owns("uploads/a.txt")).toBe(false);
    });

    it("answers null for unknown and foreign keys", async () => {
        const { store, fetched } = fakeHost();
        expect(await store.get("uploads/missing.png")).toBeNull();
        expect(await store.get("opfs://x.png")).toBeNull();
        expect(fetched).toEqual(["/files/uploads/missing.png"]);
    });

    it("uploads outputs under a key that keeps the filename", async () => {
        const { store, files, fetched } = fakeHost();
        const ref = await store.put(enc("png!"), {
            ext: "png",
            mime: "image/png",
            filename: "page 1:r03.png",
        });
        expect(ref).toEqual({
            file_key: expect.stringMatching(
                /^\.runs\/browser\/[0-9a-f]{32}\/page_1_r03\.png$/,
            ),
            mime: "image/png",
            filename: "page 1:r03.png",
        });
        const bare = await store.put(enc("x"), { ext: "bin" });
        expect(bare.file_key).toMatch(/^\.runs\/browser\/[0-9a-f]{32}\.bin$/);
        expect(dec(files.get(ref.file_key) ?? null)).toBe("png!");
        expect(store.owns(ref.file_key)).toBe(true);
        // Served from the cache: no download of what was just uploaded.
        expect(dec(await store.get(ref.file_key))).toBe("png!");
        expect(fetched).toEqual([]);
    });

    it("evicts the least recently used bytes past the cache limit", async () => {
        const { store, fetched } = fakeHost();
        const a = await store.put(enc("aaaa"), { ext: "bin" });
        const b = await store.put(enc("bbbb"), { ext: "bin" });
        await store.get(a.file_key); // a is now the most recent
        await store.put(enc("cccc"), { ext: "bin" }); // evicts b
        await store.get(a.file_key);
        expect(fetched).toEqual([]);
        expect(dec(await store.get(b.file_key))).toBe("bbbb");
        expect(fetched).toEqual([`/files/${b.file_key}`]);
    });

    it("refuses a host key that drops the filename", async () => {
        const store = createHostAssetStore({
            resolveUrl: (k) => `/files/${k}`,
            upload: async () => "uploads/abc123.png",
        });
        await expect(
            store.put(enc("x"), { ext: "png", filename: "table.png" }),
        ).rejects.toThrow("drops its filename 'table.png'");
    });

    it("a named edge output reaches the downstream node with its filename", async () => {
        const { store } = fakeHost();
        const registry: Pick<PluginsRegistry, "plugins"> = {
            plugins: {
                "tongflow-edge-x": {
                    localSubdir: "tongflow-edge-x",
                    entryFile: "dist/index.js",
                    runtime: "browser",
                    methodsByNodeSlot: {
                        "image-orient": { methodName: "orient" },
                        "ocr-image": { methodName: "ocr" },
                    },
                },
            },
        };
        const plugin = defineEdgePlugin({
            methods: {
                orient: edgeMethod("image-orient", async (input) => ({
                    success: true,
                    image: {
                        bytesBase64: utf8ToBase64(
                            `up:${base64ToUtf8(input.image.bytesBase64)}`,
                        ),
                        mime: "image/png",
                        filename: "page1-r03-table.png",
                    },
                })),
                ocr: edgeMethod("ocr-image", async (input) => ({
                    success: true,
                    text: `${input.image.filename}|${base64ToUtf8(input.image.bytesBase64)}`,
                })),
            },
        });
        const handle = (fromNodeId: string, fromField: string) => ({
            kind: "handle",
            sources: [{ fromNodeId, fromField }],
            targetHandle: "in:image",
            consumerShape: "scalar",
        });
        const doc = {
            name: "named",
            version: "1.0",
            exportedAt: "2026-01-01T00:00:00.000Z",
            inputs: [],
            outputs: [],
            dataNodes: [
                {
                    id: "src",
                    type: "imageNode",
                    dataType: "image",
                    level: 0,
                    staticData: { fileKeys: ["uploads/a.txt"] },
                },
                { id: "mid", type: "imageNode", dataType: "image", level: 2 },
                { id: "txt", type: "textNode", dataType: "text", level: 4 },
            ],
            executableNodes: [
                {
                    id: "orient",
                    type: "imageOrientNode",
                    feature: "image-orient",
                    pluginId: "tongflow-edge-x",
                    label: "orient",
                    bindings: { image: handle("src", "fileKeys") },
                    outputs: [
                        {
                            sourceField: "image",
                            nodeType: "imageNode",
                            dataField: "fileKeys",
                            expandEach: false,
                            itemValuePath: "file_key",
                            downstreamDataNodeId: "mid",
                        },
                    ],
                    dependencies: ["src"],
                    level: 1,
                },
                {
                    id: "ocr",
                    type: "ocrImageNode",
                    feature: "ocr-image",
                    pluginId: "tongflow-edge-x",
                    label: "ocr",
                    bindings: { image: handle("orient", "image") },
                    outputs: [
                        {
                            sourceField: "text",
                            nodeType: "textNode",
                            dataField: "texts",
                            expandEach: false,
                            downstreamDataNodeId: "txt",
                        },
                    ],
                    dependencies: ["mid"],
                    level: 3,
                },
            ],
            executionLevels: [["orient"], ["ocr"]],
            dataNodeEdges: [],
            originalFlow: { nodes: [], edges: [] },
        } as unknown as ExecutableWorkflow;
        const result = await runWorkflow(doc, {
            executor: createInProcessEdgeExecutor({
                registry,
                loadPlugin: () => plugin,
            }),
            store,
        });
        expect(result.errors).toEqual([]);
        const key = (result.outputs.orient.image as { file_key: string })
            .file_key;
        expect(key).toMatch(/\/page1-r03-table\.png$/);
        expect(result.outputs.ocr.text).toBe("page1-r03-table.png|up:hello");
    });

    it("fails on a server error", async () => {
        const store = createHostAssetStore({
            resolveUrl: (k) => `/files/${k}`,
            upload: async () => "x",
            fetch: async () => new Response("no", { status: 500 }),
        });
        await expect(store.get("uploads/a.txt")).rejects.toThrow(
            "HTTP Error 500 reading host file 'uploads/a.txt'",
        );
    });
});

function request(model?: string): InvokeRequest {
    return {
        pluginId: "tongflow-edge-x",
        nodeSlot: "gen-text",
        prompt: {},
        ...(model ? { model } : {}),
        signal: new AbortController().signal,
        onProgress: () => {},
    };
}

describe("createConsentGate", () => {
    const inner: NodeExecutor = {
        invoke: async (req) => ({ success: true, text: req.model ?? "" }),
    };

    it("asks once per key and remembers the answer", async () => {
        const asked: string[] = [];
        const gate = createConsentGate({
            requires: ({ model }) =>
                model === "big"
                    ? { key: model, label: "Big (≈800 MB)", approxMB: 800 }
                    : undefined,
            ask: async (r) => {
                asked.push(r.key);
                return true;
            },
        });
        const ex = gate.wrap(inner);
        await expect(ex.invoke(request("small"))).resolves.toMatchObject({
            text: "small",
        });
        const [a, b] = await Promise.all([
            ex.invoke(request("big")),
            ex.invoke(request("big")),
        ]);
        expect(a.text).toBe("big");
        expect(b.text).toBe("big");
        await ex.invoke(request("big"));
        expect(asked).toEqual(["big"]);
        expect(gate.decision("big")).toBe(true);
    });

    it("a refusal fails the node with a readable error", async () => {
        const gate = createConsentGate({
            requires: () => ({ key: "m", label: "Model M (≈300 MB)" }),
            ask: async () => false,
        });
        await expect(gate.wrap(inner).invoke(request())).rejects.toThrow(
            "Not run: you declined Model M (≈300 MB).",
        );
        expect(gate.decision("m")).toBe(false);
    });

    it("withdraws the question when every waiter is aborted", async () => {
        let questionSignal: AbortSignal | undefined;
        const gate = createConsentGate({
            requires: () => ({ key: "m", label: "M" }),
            ask: (_r, signal) => {
                questionSignal = signal;
                return new Promise<boolean>(() => {});
            },
        });
        const ac = new AbortController();
        const pending = gate
            .wrap(inner)
            .invoke({ ...request(), signal: ac.signal });
        await new Promise((r) => setTimeout(r, 0));
        ac.abort();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(questionSignal?.aborted).toBe(true);
        expect(gate.decision("m")).toBeUndefined();
    });
});
