import { describe, expect, it } from "vitest";
import type { ExecutableWorkflow } from "../../core/workflow/executable-workflow";
import { base64ToUtf8, utf8ToBase64 } from "../base64";
import { MemoryAssetStore } from "../memory-store";
import { runWorkflow } from "../run-workflow";
import type { ExecutorProgress, InvokeRequest } from "../types";
import { createCompositeExecutor } from "./composite";
import {
    createHttpRemoteExecutor,
    RemoteExecutorError,
    type RemoteFetch,
} from "./remote";
import { encodeRemoteFrame, type RemoteInvokeFrame } from "./remote-protocol";

interface Call {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
    signal?: AbortSignal;
}

/** A stream that hands out the given text pieces, then ends (or stays open). */
function streamOf(
    pieces: string[],
    options: { keepOpen?: boolean; signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const p of pieces) controller.enqueue(enc.encode(p));
            if (!options.keepOpen) controller.close();
            options.signal?.addEventListener("abort", () => {
                try {
                    controller.error(new Error("aborted"));
                } catch {
                    // already closed
                }
            });
        },
    });
}

function sse(
    frames: RemoteInvokeFrame[],
    options: { keepOpen?: boolean; signal?: AbortSignal } = {},
): Response {
    return new Response(streamOf(frames.map(encodeRemoteFrame), options), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
    });
}

function fakeFetch(
    respond: (call: Call, calls: Call[]) => Response | Promise<Response>,
): { fetch: RemoteFetch; calls: Call[] } {
    const calls: Call[] = [];
    return {
        calls,
        fetch: async (url, init) => {
            const call: Call = {
                url,
                headers: init.headers,
                body: JSON.parse(init.body) as Record<string, unknown>,
                ...(init.signal ? { signal: init.signal } : {}),
            };
            calls.push(call);
            return respond(call, calls);
        },
    };
}

function request(
    overrides: Partial<InvokeRequest> = {},
): InvokeRequest & { progress: ExecutorProgress[] } {
    const progress: ExecutorProgress[] = [];
    return {
        pluginId: "tongflow-api-fake",
        nodeSlot: "gen-text",
        prompt: { text: "hi" },
        signal: new AbortController().signal,
        onProgress: (p) => progress.push(p),
        progress,
        ...overrides,
    };
}

describe("createHttpRemoteExecutor", () => {
    it("posts the materialized prompt and returns the result frame's output", async () => {
        const { fetch, calls } = fakeFetch(() =>
            sse([
                { type: "started", invocationId: "inv-1" },
                { type: "progress", message: "thinking", percent: 40 },
                { type: "progress", message: "almost" },
                { type: "result", output: { success: true, text: "HI" } },
            ]),
        );
        const executor = createHttpRemoteExecutor({
            baseUrl: "/tongflow/p/PRJ/",
            fetch,
            headers: { authorization: "Bearer t" },
        });
        const req = request({
            prompt: {
                text: "hi",
                image: { bytesBase64: "QUJD", filename: "a.png" },
                _params: { steps: 4 },
            },
            model: "m-1",
        });
        const out = await executor.invoke(req);
        expect(out).toEqual({ success: true, text: "HI" });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("/tongflow/p/PRJ/api/engine/invoke");
        expect(calls[0].headers).toMatchObject({
            authorization: "Bearer t",
            "content-type": "application/json",
            accept: "text/event-stream",
        });
        // `_params` leaves the prompt and rides top-level.
        expect(calls[0].body).toEqual({
            pluginId: "tongflow-api-fake",
            nodeSlot: "gen-text",
            prompt: {
                text: "hi",
                image: { bytesBase64: "QUJD", filename: "a.png" },
            },
            model: "m-1",
            _params: { steps: 4 },
        });
        expect(req.progress).toEqual([
            { kind: "progress", message: "thinking", percent: 40 },
            { kind: "progress", message: "almost" },
        ]);
    });

    it("parses frames split across chunks, CRLF endings and comments", async () => {
        const output = { success: true, text: "x".repeat(50_000) };
        const text = `: ok\r\n\r\n${encodeRemoteFrame({ type: "started", invocationId: "i" }).replace(/\n/g, "\r\n")}${encodeRemoteFrame({ type: "result", output })}`;
        // Split into small pieces, including between `\r` and `\n`.
        const pieces: string[] = [];
        for (let i = 0; i < text.length; i += 7)
            pieces.push(text.slice(i, i + 7));
        const executor = createHttpRemoteExecutor({
            baseUrl: "",
            fetch: async () => new Response(streamOf(pieces), { status: 200 }),
        });
        expect(await executor.invoke(request())).toEqual(output);
    });

    it("headers may be computed per request", async () => {
        let n = 0;
        const { fetch, calls } = fakeFetch(() =>
            sse([{ type: "result", output: { success: true } }]),
        );
        const executor = createHttpRemoteExecutor({
            baseUrl: "https://api.example",
            fetch,
            headers: async () => ({ "x-n": String(++n) }),
        });
        await executor.invoke(request());
        await executor.invoke(request());
        expect(calls.map((c) => c.headers["x-n"])).toEqual(["1", "2"]);
        expect(calls[0].url).toBe("https://api.example/api/engine/invoke");
    });

    it("an error frame fails the call with its message and code", async () => {
        const executor = createHttpRemoteExecutor({
            baseUrl: "",
            fetch: async () =>
                sse([
                    { type: "started", invocationId: "i" },
                    { type: "error", error: "model exploded", code: "failed" },
                ]),
        });
        const err = await executor.invoke(request()).catch((e) => e);
        expect(err).toBeInstanceOf(RemoteExecutorError);
        expect(err.message).toBe("model exploded");
        expect(err.code).toBe("failed");
    });

    it("a refused call surfaces the backend's JSON error", async () => {
        const executor = createHttpRemoteExecutor({
            baseUrl: "",
            fetch: async () =>
                Response.json(
                    {
                        error: "Plugin tongflow-edge-x runs in the browser",
                        code: "browser_plugin",
                    },
                    { status: 400 },
                ),
        });
        const err = await executor.invoke(request()).catch((e) => e);
        expect(err).toBeInstanceOf(RemoteExecutorError);
        expect(err.status).toBe(400);
        expect(err.code).toBe("browser_plugin");
        expect(err.message).toContain("runs in the browser");
    });

    it("a non-JSON refusal keeps the status text", async () => {
        const executor = createHttpRemoteExecutor({
            baseUrl: "",
            fetch: async () => new Response("Unauthorized", { status: 401 }),
        });
        const err = await executor.invoke(request()).catch((e) => e);
        expect(err.status).toBe(401);
        expect(err.message).toBe("Unauthorized");
    });

    it("a stream that ends without a result fails clearly", async () => {
        const executor = createHttpRemoteExecutor({
            baseUrl: "",
            fetch: async () => sse([{ type: "started", invocationId: "i" }]),
        });
        await expect(executor.invoke(request())).rejects.toThrow(
            /closed before plugin tongflow-api-fake returned a result/,
        );
    });

    describe("billing confirmation", () => {
        const needsConfirmation = () =>
            Response.json(
                {
                    error: "needs confirmation",
                    code: "needs_confirmation",
                    confirmation: {
                        pluginId: "tongflow-api-fake",
                        nodeSlot: "gen-text",
                        billing: "api",
                        note: "every run is billed by the provider",
                    },
                },
                { status: 409 },
            );

        it("without confirm, the node fails with needs_confirmation", async () => {
            const { fetch, calls } = fakeFetch(needsConfirmation);
            const executor = createHttpRemoteExecutor({ baseUrl: "", fetch });
            const err = await executor.invoke(request()).catch((e) => e);
            expect(err).toBeInstanceOf(RemoteExecutorError);
            expect(err.code).toBe("needs_confirmation");
            expect(err.confirmation.billing).toBe("api");
            expect(err.message).toBe(
                "Plugin tongflow-api-fake (nodeSlot=gen-text) bills you (api: every run is billed by the provider). Confirm the run before it executes on the server.",
            );
            expect(calls).toHaveLength(1);
        });

        it("a yes resends the call with confirmed: true", async () => {
            const asked: unknown[] = [];
            const { fetch, calls } = fakeFetch((call) =>
                call.body.confirmed
                    ? sse([{ type: "result", output: { success: true } }])
                    : needsConfirmation(),
            );
            const executor = createHttpRemoteExecutor({
                baseUrl: "",
                fetch,
                confirm: (c) => {
                    asked.push(c);
                    return true;
                },
            });
            expect(await executor.invoke(request())).toEqual({ success: true });
            expect(calls.map((c) => c.body.confirmed)).toEqual([
                undefined,
                true,
            ]);
            expect(asked).toHaveLength(1);
        });

        it("a no fails the node without resending", async () => {
            const { fetch, calls } = fakeFetch(needsConfirmation);
            const executor = createHttpRemoteExecutor({
                baseUrl: "",
                fetch,
                confirm: async () => false,
            });
            await expect(executor.invoke(request())).rejects.toMatchObject({
                code: "needs_confirmation",
            });
            expect(calls).toHaveLength(1);
        });
    });

    it("abort posts the stop endpoint with the invocation id and drops the stream", async () => {
        const abort = new AbortController();
        let streamSignal: AbortSignal | undefined;
        const { fetch, calls } = fakeFetch((call) => {
            if (call.url.endsWith("/stop"))
                return Response.json({ status: "cancelled", wasRunning: true });
            streamSignal = call.signal;
            return sse(
                [
                    { type: "started", invocationId: "inv-42" },
                    { type: "progress", message: "working" },
                ],
                {
                    keepOpen: true,
                    ...(call.signal ? { signal: call.signal } : {}),
                },
            );
        });
        const executor = createHttpRemoteExecutor({
            baseUrl: "/b",
            fetch,
            headers: { cookie: "c=1" },
        });
        const req = request({
            signal: abort.signal,
            onProgress: (p) => {
                if (p.kind === "progress" && p.message === "working")
                    abort.abort();
            },
        });
        await expect(executor.invoke(req)).rejects.toThrow();
        await new Promise((r) => setTimeout(r, 0));
        expect(streamSignal?.aborted).toBe(true);
        const stop = calls.find((c) => c.url === "/b/api/engine/invoke/stop");
        expect(stop?.body).toEqual({ invocationId: "inv-42" });
        expect(stop?.headers.cookie).toBe("c=1");
    });

    it("an already aborted signal sends nothing", async () => {
        const abort = new AbortController();
        abort.abort();
        const { fetch, calls } = fakeFetch(() =>
            sse([{ type: "result", output: { success: true } }]),
        );
        const executor = createHttpRemoteExecutor({ baseUrl: "", fetch });
        await expect(
            executor.invoke(request({ signal: abort.signal })),
        ).rejects.toThrow();
        expect(calls).toHaveLength(0);
    });

    it("runs the Python nodes of a workflow through the composite executor; asset outputs land in the browser store", async () => {
        const store = new MemoryAssetStore();
        const { fetch, calls } = fakeFetch((call) => {
            const image = (
                call.body.prompt as { image: { bytesBase64: string } }
            ).image;
            return sse([
                { type: "started", invocationId: "i" },
                {
                    type: "result",
                    output: {
                        success: true,
                        image: {
                            bytesBase64: utf8ToBase64(
                                `oriented:${base64ToUtf8(image.bytesBase64)}`,
                            ),
                            mime: "image/png",
                            filename: "out.png",
                        },
                    },
                },
            ]);
        });
        const doc = {
            executableNodes: [
                {
                    id: "n1",
                    type: "imageOrientNode",
                    feature: "image-orient",
                    pluginId: "tongflow-modal-orient",
                    bindings: {
                        image: {
                            kind: "handle",
                            consumerShape: "scalar",
                            sources: [
                                { fromNodeId: "img", fromField: "fileKeys" },
                            ],
                        },
                    },
                    outputs: [
                        {
                            sourceField: "image",
                            nodeType: "imageNode",
                            dataField: "fileKeys",
                            expandEach: false,
                            itemValuePath: "file_key",
                        },
                    ],
                    dependencies: [],
                    level: 0,
                },
            ],
            dataNodes: [
                {
                    id: "img",
                    dataType: "image",
                    staticData: {
                        fileKeys: [
                            `data:image/png;base64,${utf8ToBase64("raw")}`,
                        ],
                    },
                },
            ],
            executionLevels: [["n1"]],
            outputs: [{ name: "out", nodeId: "n1", field: "image" }],
        } as unknown as ExecutableWorkflow;
        const result = await runWorkflow(doc, {
            executor: createCompositeExecutor({
                registry: { plugins: {} },
                remote: createHttpRemoteExecutor({ baseUrl: "", fetch }),
            }),
            store,
        });
        expect(result.status).toBe("success");
        // The server got bytes (ADR 0001), the browser keeps a store key.
        expect(calls[0].body.prompt).toEqual({
            image: { bytesBase64: utf8ToBase64("raw"), mime: "image/png" },
        });
        const key = result.outputsByName.out[0];
        expect(store.owns(key)).toBe(true);
        const bytes = await store.get(key);
        expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe(
            "oriented:raw",
        );
    });
});
