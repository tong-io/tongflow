/**
 * The HTTP remote executor: runs a `runtime: python` node on a TongFlow
 * backend (Studio or the Next app) and returns its raw ABI output, so a
 * browser-run workflow can mix edge nodes with server nodes.
 *
 * One invocation = one `POST {base}/api/engine/invoke` whose response is an
 * SSE stream read through `fetch` (no `EventSource`, so the request carries a
 * body and the host's headers). Aborting the node's signal posts
 * `{base}/api/engine/invoke/stop` and drops the stream; the backend also stops
 * the run when the stream's connection closes. Platform neutral: only
 * `fetch`, streams and `TextDecoder`.
 */

import type { InvokeRequest, RemoteExecutor } from "../types";
import { splitPrompt } from "./edge-target";
import {
    REMOTE_INVOKE_PATH,
    REMOTE_STOP_PATH,
    type RemoteConfirmation,
    type RemoteInvokeErrorBody,
    type RemoteInvokeFrame,
    type RemoteInvokeRequest,
} from "./remote-protocol";

/** The subset of `fetch` the executor calls. */
export type RemoteFetch = (
    url: string,
    init: {
        method: string;
        headers: Record<string, string>;
        body: string;
        signal?: AbortSignal;
    },
) => Promise<Response>;

export interface HttpRemoteExecutorOptions {
    /**
     * The backend's API base, the same base the canvas uses as `apiBaseUrl`:
     * `""` or `https://app.example` for the Next app, `/tongflow/p/<projectId>`
     * for Studio. `/api/engine/invoke` is appended.
     */
    baseUrl: string;
    /** Default: `globalThis.fetch`. */
    fetch?: RemoteFetch;
    /** Extra request headers (auth), or a function returning them per request. */
    headers?:
        | Record<string, string>
        | (() => Record<string, string> | Promise<Record<string, string>>);
    /**
     * Called when the backend refuses a paid plugin until the user agrees
     * (Studio's billing checkpoint). Resolve `true` to resend the call with
     * `confirmed: true`. Without it, or on `false`, the node fails with a
     * {@link RemoteExecutorError} whose `code` is `needs_confirmation`.
     * Called every time the backend asks; nothing is remembered.
     */
    confirm?: (confirmation: RemoteConfirmation) => boolean | Promise<boolean>;
}

/** A remote call the backend refused or failed; `code` is the protocol's error code. */
export class RemoteExecutorError extends Error {
    readonly code: string | undefined;
    readonly status: number | undefined;
    readonly confirmation: RemoteConfirmation | undefined;

    constructor(
        message: string,
        options: {
            code?: string;
            status?: number;
            confirmation?: RemoteConfirmation;
        } = {},
    ) {
        super(message);
        this.name = "RemoteExecutorError";
        this.code = options.code;
        this.status = options.status;
        this.confirmation = options.confirmation;
    }
}

function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/+$/, "")}${path}`;
}

async function readErrorBody(res: Response): Promise<RemoteInvokeErrorBody> {
    const text = await res.text().catch(() => "");
    try {
        const body = JSON.parse(text) as unknown;
        if (body && typeof body === "object" && "error" in body) {
            return body as RemoteInvokeErrorBody;
        }
    } catch {
        // not JSON
    }
    return {
        error: text.trim() || `HTTP ${res.status} ${res.statusText}`.trim(),
    };
}

function refusalMessage(
    body: RemoteInvokeErrorBody,
    req: InvokeRequest,
): string {
    if (body.code === "needs_confirmation") {
        const c = body.confirmation;
        const billing = c ? ` (${c.billing}: ${c.note})` : "";
        return `Plugin ${req.pluginId} (nodeSlot=${req.nodeSlot}) bills you${billing}. Confirm the run before it executes on the server.`;
    }
    return body.error;
}

/**
 * Parse an SSE byte stream into `data:` payloads. Handles `\n`, `\r\n` and
 * `\r` line endings, comments and multi-line data; large frames (inline
 * assets) are scanned once.
 */
async function* readSse(
    body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    // Pieces of the current, unterminated line; each chunk is scanned once.
    let pending: string[] = [];
    // The previous chunk ended a line with `\r`: a leading `\n` belongs to it.
    let skipLf = false;
    let data: string[] = [];
    const takeLines = function* (text: string): Generator<string> {
        let start = 0;
        for (let i = 0; i < text.length; i++) {
            const ch = text.charCodeAt(i);
            if (skipLf) {
                skipLf = false;
                if (ch === 10) {
                    start = i + 1;
                    continue;
                }
            }
            if (ch !== 10 && ch !== 13) continue;
            pending.push(text.slice(start, i));
            const line = pending.join("");
            pending = [];
            if (ch === 13) skipLf = true;
            start = i + 1;
            yield line;
        }
        if (start < text.length) pending.push(text.slice(start));
    };
    const onLine = (line: string): string | undefined => {
        if (line === "") {
            if (data.length === 0) return undefined;
            const payload = data.join("\n");
            data = [];
            return payload;
        }
        if (line.startsWith(":")) return undefined;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        if (field !== "data") return undefined;
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        data.push(value);
        return undefined;
    };
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) {
                for (const line of takeLines(decoder.decode())) {
                    const payload = onLine(line);
                    if (payload !== undefined) yield payload;
                }
                // An unterminated last line, then the end of the last event.
                if (pending.length > 0) onLine(pending.join(""));
                const last = onLine("");
                if (last !== undefined) yield last;
                return;
            }
            for (const line of takeLines(
                decoder.decode(value, { stream: true }),
            )) {
                const payload = onLine(line);
                if (payload !== undefined) yield payload;
            }
        }
    } finally {
        // Done, or the caller stopped early (result received, cancelled):
        // either way drop the connection.
        reader.cancel().catch(() => undefined);
    }
}

export function createHttpRemoteExecutor(
    options: HttpRemoteExecutorOptions,
): RemoteExecutor {
    const doFetch: RemoteFetch =
        options.fetch ??
        ((url, init) =>
            (globalThis.fetch as unknown as RemoteFetch)(url, init));
    const invokeUrl = joinUrl(options.baseUrl, REMOTE_INVOKE_PATH);
    const stopUrl = joinUrl(options.baseUrl, REMOTE_STOP_PATH);
    const headers = async (): Promise<Record<string, string>> => {
        const extra =
            typeof options.headers === "function"
                ? await options.headers()
                : (options.headers ?? {});
        return { "content-type": "application/json", ...extra };
    };

    const stop = async (invocationId: string) => {
        try {
            await doFetch(stopUrl, {
                method: "POST",
                headers: await headers(),
                body: JSON.stringify({ invocationId }),
            });
        } catch {
            // Best effort: the backend also stops when the stream closes.
        }
    };

    const once = async (
        req: InvokeRequest,
        body: RemoteInvokeRequest,
    ): Promise<Record<string, unknown>> => {
        if (req.signal.aborted) throw new Error("cancelled");
        const connection = new AbortController();
        let invocationId: string | undefined;
        const onAbort = () => {
            if (invocationId) void stop(invocationId);
            connection.abort();
        };
        req.signal.addEventListener("abort", onAbort, { once: true });
        try {
            const res = await doFetch(invokeUrl, {
                method: "POST",
                headers: {
                    ...(await headers()),
                    accept: "text/event-stream",
                },
                body: JSON.stringify(body),
                signal: connection.signal,
            });
            if (!res.ok) {
                const err = await readErrorBody(res);
                throw new RemoteExecutorError(refusalMessage(err, req), {
                    ...(err.code ? { code: err.code } : {}),
                    status: res.status,
                    ...(err.confirmation
                        ? { confirmation: err.confirmation }
                        : {}),
                });
            }
            if (!res.body) {
                throw new RemoteExecutorError(
                    "Remote executor: the backend returned no stream.",
                );
            }
            for await (const payload of readSse(res.body)) {
                let frame: RemoteInvokeFrame;
                try {
                    frame = JSON.parse(payload) as RemoteInvokeFrame;
                } catch {
                    continue;
                }
                switch (frame.type) {
                    case "started":
                        invocationId = frame.invocationId;
                        break;
                    case "progress":
                        req.onProgress({
                            kind: "progress",
                            message: frame.message,
                            ...(typeof frame.percent === "number"
                                ? { percent: frame.percent }
                                : {}),
                        });
                        break;
                    case "result":
                        return frame.output;
                    case "error":
                        throw new RemoteExecutorError(frame.error, {
                            ...(frame.code ? { code: frame.code } : {}),
                        });
                    default:
                        break;
                }
            }
            throw new RemoteExecutorError(
                `Remote executor: the connection to the backend closed before plugin ${req.pluginId} returned a result.`,
            );
        } finally {
            req.signal.removeEventListener("abort", onAbort);
        }
    };

    return {
        async invoke(req: InvokeRequest) {
            const { input, params } = splitPrompt(req.prompt);
            const body: RemoteInvokeRequest = {
                pluginId: req.pluginId,
                nodeSlot: req.nodeSlot,
                prompt: input,
                ...(req.model ? { model: req.model } : {}),
                ...(params ? { _params: params } : {}),
            };
            try {
                return await once(req, body);
            } catch (e) {
                if (
                    e instanceof RemoteExecutorError &&
                    e.code === "needs_confirmation" &&
                    options.confirm &&
                    !req.signal.aborted &&
                    (await options.confirm(
                        e.confirmation ?? {
                            pluginId: req.pluginId,
                            nodeSlot: req.nodeSlot,
                            billing: "unknown",
                            note: e.message,
                        },
                    ))
                ) {
                    return once(req, { ...body, confirmed: true });
                }
                throw e;
            }
        },
    };
}
