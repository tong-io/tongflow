/**
 * The browser edge runtime behind the Studio canvas. When at least one
 * browser plugin (`tongflow-edge-*`) is installed, the canvas gets
 *
 * - a "Run workflow" runner on the TypeScript engine: edge nodes run in a Web
 *   Worker per plugin, loaded same-origin from
 *   `<prefix>/plugins/files/<id>/<version>/<entry>?modelBase=…`; Python
 *   nodes go to this project's `/api/engine/invoke` (which keeps the
 *   studio's paid-run confirmation: `confirmPaid` answers it);
 * - a task transport, so "Run" on a single edge node runs it the same way
 *   (every other node keeps the server path);
 * - a consent question before a large model download (`models.json`).
 *
 * Files bridge through the project (see docs/edge-runtime.md, "Hosts"): an
 * asset input that is a project key is fetched from `<prefix>/p/<pid>/files/`
 * when a node needs it; a binary output (edge or server) is uploaded into
 * `.runs/browser/` of the project and travels as that project key, so the
 * canvas shows it, the saved workflow keeps it and the server can read it.
 *
 * With no browser plugin installed, `loadStudioEdgeRuntime` resolves `null`
 * and the canvas is exactly what it was.
 */
import type { PluginsRegistry } from "tongflow";
import {
    type AssetPutMeta,
    type ConsentRequest,
    createHostAssetStore,
    createHttpRemoteExecutor,
    type NodeExecutor,
    type RemoteConfirmation,
} from "tongflow/engine";
import {
    createEdgeHostRuntime,
    type EdgeHostRuntime,
    type EdgeModelInfo,
    largeModelConsent,
} from "tongflow/engine/browser";
import type { CanvasTaskTransport } from "tongflow/engine/canvas";
import type { EdgePluginsInfo } from "../shared/types.ts";
import { encodeKey, PREFIX } from "./api.ts";

/** Where binary outputs of browser runs land in the project. */
export const BROWSER_OUTPUT_DIR = ".runs/browser";

export interface StudioEdgeRuntimeOptions {
    pid: string;
    /** Studio route prefix. Default `/tongflow`. */
    prefix?: string;
    /** Default `location.origin`. */
    origin?: string;
    /** Extra headers on every request (tests pass the studio cookie). */
    headers?: Record<string, string>;
    /** The canvas's own transport for non-browser nodes (`httpTaskTransport`). */
    fallbackTransport: CanvasTaskTransport;
    /** The studio refused a paid plugin until the user agrees. */
    confirmPaid: (confirmation: RemoteConfirmation) => Promise<boolean>;
    /** A large model download; `signal` aborts when the run no longer waits. */
    confirmDownload: (
        request: ConsentRequest,
        signal: AbortSignal,
    ) => Promise<boolean>;
    /** Replaces the Web Worker edge executor (tests). */
    edge?: NodeExecutor;
}

export interface StudioEdgeRuntime extends EdgeHostRuntime {
    info: EdgePluginsInfo;
}

export async function loadStudioEdgeRuntime(
    options: StudioEdgeRuntimeOptions,
): Promise<StudioEdgeRuntime | null> {
    const prefix = options.prefix ?? PREFIX;
    const origin = options.origin ?? globalThis.location.origin;
    const headers = options.headers ?? {};
    const get = async <T>(path: string): Promise<T> => {
        const res = await fetch(`${origin}${path}`, {
            headers,
            credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
        return (await res.json()) as T;
    };

    let info = await get<EdgePluginsInfo>(`${prefix}/plugins/edge`);
    if (Object.keys(info.plugins).length === 0) return null;
    const projectBase = `${prefix}/p/${encodeURIComponent(options.pid)}`;
    const registry: Pick<PluginsRegistry, "plugins"> = {
        plugins: (
            await get<PluginsRegistry>(`${projectBase}/api/plugins/registry`)
        ).plugins,
    };
    const models: Record<string, EdgeModelInfo[]> = {};
    for (const [id, p] of Object.entries(info.plugins)) {
        if (!p.modelsUrl) continue;
        models[id] = await get<EdgeModelInfo[]>(p.modelsUrl).catch(() => []);
    }

    const store = createHostAssetStore({
        resolveUrl: (key) =>
            /^[a-z][a-z0-9+.-]*:/i.test(key)
                ? null
                : `${origin}${projectBase}/files/${encodeKey(key.replace(/^\/+/, ""))}`,
        fetch: (url, init) => fetch(url, { ...init, headers: { ...headers } }),
        upload: (bytes, meta) =>
            uploadOutput(`${origin}${projectBase}`, headers, bytes, meta),
    });

    const runtime = createEdgeHostRuntime({
        registry,
        entryUrl: (id) => `${origin}${info.plugins[id]?.entryUrl ?? ""}`,
        modelBase: info.modelBase,
        origin,
        remote: createHttpRemoteExecutor({
            baseUrl: `${origin}${projectBase}`,
            headers,
            confirm: options.confirmPaid,
        }),
        store,
        fallbackTransport: options.fallbackTransport,
        consent: {
            requires: largeModelConsent({ registry, models }),
            ask: options.confirmDownload,
        },
        ...(options.edge ? { edge: options.edge } : {}),
    });

    // A plugin installed or removed since the canvas opened: re-read before a run.
    const refresh = async () => {
        info = await get<EdgePluginsInfo>(`${prefix}/plugins/edge`);
        registry.plugins = (
            await get<PluginsRegistry>(`${projectBase}/api/plugins/registry`)
        ).plugins;
    };
    const inner = runtime.runner;
    return {
        ...runtime,
        get info() {
            return info;
        },
        runner: {
            controls: inner.controls,
            get controller() {
                return inner.controller;
            },
            async run(doc, runOptions) {
                await refresh().catch(() => undefined);
                return inner.run(doc, runOptions);
            },
        },
    };
}

/** One binary output → `POST <project>/upload?dir=.runs/browser` → its project key. */
async function uploadOutput(
    projectUrl: string,
    headers: Record<string, string>,
    bytes: Uint8Array,
    meta: AssetPutMeta,
): Promise<string> {
    const stem =
        (meta.filename ?? "output")
            .replace(/\.[^.]*$/, "")
            .replace(/[^\w.-]+/g, "_")
            .slice(0, 60) || "output";
    const unique = Math.random().toString(36).slice(2, 8);
    const name = `${stem}-${unique}.${meta.ext}`;
    const form = new FormData();
    form.append(
        "file",
        new Blob([bytes as Uint8Array<ArrayBuffer>], {
            type: meta.mime ?? "application/octet-stream",
        }),
        name,
    );
    const res = await fetch(
        `${projectUrl}/upload?dir=${encodeURIComponent(BROWSER_OUTPUT_DIR)}`,
        { method: "POST", body: form, headers, credentials: "same-origin" },
    );
    const body = (await res.json().catch(() => ({}))) as {
        files?: { key: string }[];
        error?: string;
    };
    const key = body.files?.[0]?.key;
    if (!res.ok || !key)
        throw new Error(
            `Could not store an output in the project: ${body.error ?? `HTTP ${res.status}`}`,
        );
    return key;
}
