/** Small HTTP helpers for the studio's routes on the host's node:http server. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly code?: string,
    ) {
        super(message);
        this.name = "HttpError";
    }
}

export function sendJson(
    res: ServerResponse,
    status: number,
    body: unknown,
): void {
    const payload = JSON.stringify(body ?? null);
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(payload),
    });
    res.end(payload);
}

export function sendError(res: ServerResponse, error: unknown): void {
    if (error instanceof HttpError) {
        sendJson(res, error.status, {
            error: error.message,
            ...(error.code ? { code: error.code } : {}),
        });
        return;
    }
    const message = error instanceof Error ? error.message : String(error);
    const status = /not found|does not exist|no such/i.test(message)
        ? 404
        : /invalid|required|unknown|escapes|not a/i.test(message)
          ? 400
          : 500;
    sendJson(res, status, { error: message });
}

export async function readBody(
    req: IncomingMessage,
    limit = 64 * 1024 * 1024,
): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
        const buf = chunk as Buffer;
        total += buf.length;
        if (total > limit) throw new HttpError(413, "request body too large");
        chunks.push(buf);
    }
    return Buffer.concat(chunks);
}

export async function readJson<T = Record<string, unknown>>(
    req: IncomingMessage,
): Promise<T> {
    const buf = await readBody(req);
    if (buf.length === 0) return {} as T;
    try {
        return JSON.parse(buf.toString("utf8")) as T;
    } catch {
        throw new HttpError(400, "invalid JSON body");
    }
}

/** Parse multipart/form-data via the WHATWG Request implementation. */
export async function readFormData(req: IncomingMessage): Promise<FormData> {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    const request = new Request("http://localhost/", {
        method: "POST",
        headers,
        body: Readable.toWeb(req) as unknown as ReadableStream,
        duplex: "half",
    });
    return request.formData();
}

/** Reject cross-origin state-changing requests: browser calls must come from the host's own origin. */
export function assertSameOrigin(req: IncomingMessage): void {
    const origin = req.headers.origin;
    if (!origin) return;
    const host = req.headers.host;
    try {
        const o = new URL(origin);
        if (host && o.host === host) return;
    } catch {
        // fallthrough
    }
    throw new HttpError(403, "cross-origin request rejected");
}

export interface Route {
    method: string;
    /** Pattern like `/p/:pid/takes/:owner/:pass/:take/circle`; a trailing `/*` captures the rest as `rest`. */
    pattern: string;
    handler: (ctx: RouteContext) => Promise<void> | void;
}

export interface RouteContext {
    req: IncomingMessage;
    res: ServerResponse;
    url: URL;
    params: Record<string, string>;
    /** Remaining path for `/*` patterns (URL-decoded, no leading slash). */
    rest: string;
}

export function compileRoute(route: Route): {
    route: Route;
    match: (
        path: string,
    ) => { params: Record<string, string>; rest: string } | undefined;
} {
    const parts = route.pattern.split("/").filter(Boolean);
    const wildcard = parts[parts.length - 1] === "*";
    const fixed = wildcard ? parts.slice(0, -1) : parts;
    return {
        route,
        match(path: string) {
            const segs = path.split("/").filter(Boolean);
            if (
                wildcard
                    ? segs.length < fixed.length
                    : segs.length !== fixed.length
            )
                return undefined;
            const params: Record<string, string> = {};
            for (let i = 0; i < fixed.length; i++) {
                const p = fixed[i];
                if (p.startsWith(":"))
                    params[p.slice(1)] = decodeURIComponent(segs[i]);
                else if (p !== segs[i]) return undefined;
            }
            const rest = wildcard
                ? segs.slice(fixed.length).map(decodeURIComponent).join("/")
                : "";
            return { params, rest };
        },
    };
}
