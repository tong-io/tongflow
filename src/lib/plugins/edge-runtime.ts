/**
 * The browser edge runtime behind the app's canvas (client side). Built only
 * when a browser plugin (`tongflow-edge-*`) is installed; then the canvas
 * gets
 *
 * - a "Run workflow" runner on the TypeScript engine: edge nodes run in a Web
 *   Worker per plugin, loaded same-origin from
 *   `/api/plugins/files/<id>/<version>/<entry>?modelBase=…`; Python nodes go
 *   to `/api/engine/invoke` (the single-node task path, key preflight
 *   included; the app has no per-run billing confirmation);
 * - a task transport, so "Run" on a single edge node runs it the same way
 *   (every other node keeps `/api/task/create`);
 * - a confirm dialog before a large model download (`models.json`).
 *
 * Files bridge through the app's uploads (see docs/edge-runtime.md, "Hosts"):
 * an asset input that is an upload key is fetched from `/api/uploads/<key>`
 * when a node needs it; a binary output (edge or server) is uploaded through
 * `POST /api/upload` and travels as that file key, so the canvas shows it,
 * the saved workflow keeps it and server runs can read it.
 */

import type { PluginsRegistry } from "tongflow";
import {
    type AssetPutMeta,
    type ConsentRequest,
    createHostAssetStore,
    createHttpRemoteExecutor,
} from "tongflow/engine";
import {
    createEdgeHostRuntime,
    type EdgeHostRuntime,
    type EdgeModelInfo,
    largeModelConsent,
} from "tongflow/engine/browser";
import type { CanvasTaskTransport } from "tongflow/engine/canvas";

/** `GET /api/plugins/edge` (see edge-plugin-files.server.ts). */
interface EdgePluginsInfo {
    modelBase: string;
    crossOriginIsolated: boolean;
    plugins: Record<
        string,
        { version: string; base: string; entryUrl: string; modelsUrl?: string }
    >;
}

const UPLOADS = "/api/uploads/";

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return (await res.json()) as T;
}

/** One binary output → `POST /api/upload` → its file key. */
async function uploadOutput(
    bytes: Uint8Array,
    meta: AssetPutMeta,
): Promise<string> {
    const stem =
        (meta.filename ?? "output")
            .replace(/\.[^.]*$/, "")
            .replace(/[^\w.-]+/g, "_")
            .slice(0, 60) || "output";
    const form = new FormData();
    form.append(
        "file",
        new Blob([bytes as Uint8Array<ArrayBuffer>], {
            type: meta.mime ?? "application/octet-stream",
        }),
        `${stem}.${meta.ext}`,
    );
    const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
        credentials: "same-origin",
    });
    const body = (await res.json().catch(() => ({}))) as {
        fileKey?: string;
        error?: string;
    };
    if (!res.ok || !body.fileKey)
        throw new Error(
            `Could not store an output: ${body.error ?? `HTTP ${res.status}`}`,
        );
    return body.fileKey;
}

export interface AppEdgeRuntimeOptions {
    /** Read on every call: the hook keeps `plugins` in step with the canvas registry. */
    registry: Pick<PluginsRegistry, "plugins">;
    /** The canvas's own transport for non-browser nodes (`httpTaskTransport`). */
    fallbackTransport: CanvasTaskTransport;
    /** A large model download; resolve `true` to go ahead. */
    confirmDownload: (
        request: ConsentRequest,
        signal: AbortSignal,
    ) => Promise<boolean>;
}

/** `null` when no browser plugin is installed. */
export async function loadAppEdgeRuntime(
    options: AppEdgeRuntimeOptions,
): Promise<EdgeHostRuntime | null> {
    const info = await getJson<EdgePluginsInfo>("/api/plugins/edge");
    if (Object.keys(info.plugins).length === 0) return null;
    const models: Record<string, EdgeModelInfo[]> = {};
    for (const [id, p] of Object.entries(info.plugins)) {
        if (!p.modelsUrl) continue;
        models[id] = await getJson<EdgeModelInfo[]>(p.modelsUrl).catch(
            () => [],
        );
    }
    const store = createHostAssetStore({
        resolveUrl: (key) => {
            if (key.startsWith(UPLOADS)) return key;
            if (/^[a-z][a-z0-9+.-]*:/i.test(key) || key.startsWith("/"))
                return null;
            return `${UPLOADS}${key}`;
        },
        upload: uploadOutput,
    });
    const { registry } = options;
    return createEdgeHostRuntime({
        registry,
        entryUrl: (id) => info.plugins[id]?.entryUrl ?? "",
        modelBase: info.modelBase,
        remote: createHttpRemoteExecutor({ baseUrl: "" }),
        store,
        fallbackTransport: options.fallbackTransport,
        consent: {
            requires: largeModelConsent({ registry, models }),
            ask: options.confirmDownload,
        },
    });
}
