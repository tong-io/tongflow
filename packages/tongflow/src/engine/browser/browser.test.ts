import { afterEach, describe, expect, it } from "vitest";
import type { PluginsRegistry } from "../../core/registry/plugins-registry-schema";
import { fakeOpfsDir } from "../testing/fake-opfs";
import type { ExecutorProgress } from "../types";
import {
    defineEdgePlugin,
    edgeMethod,
    serveEdgePlugin,
} from "../worker/define-edge-plugin";
import type { MessageEndpoint } from "../worker/protocol";
import { OpfsAssetStore } from "./opfs-store";
import { createWorkerEdgeExecutor, type WorkerLike } from "./worker-executor";

const REGISTRY: Pick<PluginsRegistry, "plugins"> = {
    plugins: {
        "tongflow-edge-essentials": {
            localSubdir: "tongflow-edge-essentials",
            entryFile: "dist/index.js",
            runtime: "browser",
            methodsByNodeSlot: {
                "gen-text": { methodName: "genText" },
                "detect-language": { methodName: "detectLanguage" },
                "ocr-image": { methodName: "missingMethod" },
            },
        },
    },
};

const plugin = defineEdgePlugin({
    methods: {
        genText: edgeMethod("gen-text", async (input, ctx) => {
            ctx.modelDownload({ model: "lfm", loaded: 1, total: 2 });
            ctx.progress("generating", 50);
            return {
                success: true,
                text: `${input.text}:${ctx.params.tone ?? ""}`,
            };
        }),
        detectLanguage: edgeMethod("detect-language", (input, ctx) => {
            if (input.text === "boom") throw new TypeError("bad input");
            return new Promise((resolve, reject) => {
                ctx.signal.addEventListener("abort", () => {
                    aborted.push(input.text);
                    reject(new Error("stopped"));
                });
                setTimeout(
                    () => resolve({ success: true, language: "en" }),
                    1000,
                );
            });
        }),
    },
});

const aborted: string[] = [];
const channels: MessageChannel[] = [];

/** A fake module Worker: the plugin served on the other end of a MessageChannel. */
function channelWorker(serve = true): WorkerLike & { fail(msg: string): void } {
    const ch = new MessageChannel();
    channels.push(ch);
    const errorListeners: ((e: { message?: string }) => void)[] = [];
    if (serve) serveEdgePlugin(plugin, ch.port2 as unknown as MessageEndpoint);
    const worker = {
        postMessage: (m: unknown) => ch.port1.postMessage(m),
        addEventListener: (type: string, listener: (e: never) => void) => {
            if (type === "message") {
                ch.port1.addEventListener("message", listener as never);
                ch.port1.start();
            } else {
                errorListeners.push(listener as never);
            }
        },
        terminate: () => {
            ch.port1.close();
            ch.port2.close();
        },
        fail: (message: string) => {
            for (const l of errorListeners) l({ message });
        },
    };
    return worker as unknown as WorkerLike & { fail(msg: string): void };
}

afterEach(() => {
    for (const ch of channels.splice(0)) {
        ch.port1.close();
        ch.port2.close();
    }
});

const invoke = (
    exec: ReturnType<typeof createWorkerEdgeExecutor>,
    nodeSlot: string,
    prompt: Record<string, unknown>,
    signal = new AbortController().signal,
    progress: ExecutorProgress[] = [],
) =>
    exec.invoke({
        pluginId: "tongflow-edge-essentials",
        nodeSlot,
        prompt,
        signal,
        onProgress: (p) => progress.push(p),
    });

describe("worker edge executor (protocol over a MessageChannel)", () => {
    it("loads the plugin once, calls methods and relays both progress kinds", async () => {
        const urls: string[] = [];
        const exec = createWorkerEdgeExecutor({
            registry: REGISTRY,
            resolveModuleUrl: (id, cfg) =>
                `/plugins/${id}/${cfg.entryFile ?? "index.js"}`,
            createWorker: (url) => {
                urls.push(String(url));
                return channelWorker();
            },
        });
        const progress: ExecutorProgress[] = [];
        const out = await invoke(
            exec,
            "gen-text",
            { text: "hi", _params: { tone: "warm" } },
            undefined,
            progress,
        );
        expect(out).toEqual({ success: true, text: "hi:warm" });
        expect(progress).toEqual([
            { kind: "model-download", model: "lfm", loaded: 1, total: 2 },
            { kind: "progress", message: "generating", percent: 50 },
        ]);
        await invoke(exec, "gen-text", { text: "again" });
        expect(urls).toEqual([
            "/plugins/tongflow-edge-essentials/dist/index.js",
        ]);
        exec.dispose();
    });

    it("surfaces plugin errors and unknown methods", async () => {
        const exec = createWorkerEdgeExecutor({
            registry: REGISTRY,
            resolveModuleUrl: () => "/x.js",
            createWorker: () => channelWorker(),
        });
        await expect(
            invoke(exec, "detect-language", { text: "boom" }),
        ).rejects.toMatchObject({ name: "TypeError", message: "bad input" });
        await expect(invoke(exec, "ocr-image", { image: {} })).rejects.toThrow(
            "has no method 'missingMethod'",
        );
        exec.dispose();
    });

    it("sends cancel to the worker when the signal aborts", async () => {
        const exec = createWorkerEdgeExecutor({
            registry: REGISTRY,
            resolveModuleUrl: () => "/x.js",
            createWorker: () => channelWorker(),
        });
        const ctl = new AbortController();
        const pending = invoke(
            exec,
            "detect-language",
            { text: "long" },
            ctl.signal,
        );
        await new Promise((r) => setTimeout(r, 10));
        ctl.abort();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        await new Promise((r) => setTimeout(r, 10));
        expect(aborted).toContain("long");
        exec.dispose();
    });

    it("fails pending calls when the worker errors, then recreates it", async () => {
        const workers: ReturnType<typeof channelWorker>[] = [];
        const exec = createWorkerEdgeExecutor({
            registry: REGISTRY,
            resolveModuleUrl: () => "/broken.js",
            createWorker: () => {
                const w = channelWorker(workers.length > 0);
                workers.push(w);
                return w;
            },
        });
        const first = invoke(exec, "gen-text", { text: "a" });
        workers[0].fail("SyntaxError: unexpected token");
        await expect(first).rejects.toThrow(
            "worker failed (/broken.js): SyntaxError: unexpected token",
        );
        expect(await invoke(exec, "gen-text", { text: "b" })).toEqual({
            success: true,
            text: "b:",
        });
        expect(workers).toHaveLength(2);
        exec.dispose();
    });
});

/** A minimal in-memory FileSystemDirectoryHandle for the OPFS store. */
describe("OpfsAssetStore", () => {
    it("puts, gets, owns and deletes files under opfs:// keys", async () => {
        const root = fakeOpfsDir();
        const store = new OpfsAssetStore({ root: async () => root });
        const ref = await store.put(new TextEncoder().encode("img"), {
            ext: "png",
            mime: "image/png",
            filename: "a.png",
        });
        expect(ref.file_key).toMatch(/^opfs:\/\/[0-9a-f]{32}\/a\.png$/);
        expect(ref).toMatchObject({ mime: "image/png", filename: "a.png" });
        expect(store.owns(ref.file_key)).toBe(true);
        expect(store.owns("uploads/a.png")).toBe(false);
        expect(
            new TextDecoder().decode(
                (await store.get(ref.file_key)) ?? undefined,
            ),
        ).toBe("img");
        expect(await store.get("opfs://nope.png")).toBeNull();
        expect(await store.get("opfs://../escape")).toBeNull();
        expect(await store.get("opfs://a/../b.png")).toBeNull();
        expect(await store.get("opfs://a/b/c.png")).toBeNull();
        const [id] = ref.file_key.slice("opfs://".length).split("/");
        expect(await store.delete(`opfs://${id}/other.png`)).toBe(false);
        expect(await store.delete(ref.file_key)).toBe(true);
        expect(await store.get(ref.file_key)).toBeNull();
        expect(await store.delete(ref.file_key)).toBe(false);

        // A nameless output keeps the flat `<id>.<ext>` form.
        const flat = await store.put(new Uint8Array([7]), { ext: "png" });
        expect(flat.file_key).toMatch(/^opfs:\/\/[0-9a-f]{32}\.png$/);
        expect(await store.get(flat.file_key)).toEqual(new Uint8Array([7]));
        expect(await store.delete(flat.file_key)).toBe(true);
        await store.put(new Uint8Array([1]), { ext: "bin" });
        await store.clear();
        await expect(
            root.getDirectoryHandle("tongflow-assets"),
        ).rejects.toThrow();
    });
});
