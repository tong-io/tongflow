import "server-only";

/**
 * Serving installed browser edge plugins (`runtime: "browser"`,
 * `tongflow-edge-*`) to the page, same-origin, so the edge executor can load
 * a plugin's ESM entry in a module Web Worker and the entry can fetch its
 * `dist/` chunks and assets (wasm, fonts, CMaps) next to it.
 *
 *   GET /api/plugins/edge                                 installed browser plugins + model base
 *   GET /api/plugins/files/<pluginId>/<version>/<path>    one file of the plugin directory
 *
 * `<version>` is a content hash of the plugin (manifest, entry, package.json,
 * models.json and the git HEAD). Every relative URL the entry resolves keeps
 * it, so the plugin is cached `immutable` and an update (a new hash) is a new
 * URL: `index.js` is never served stale. Any other version still gets the
 * current file, with `no-cache`. Only `runtime: "browser"` plugins of the
 * registry are served, only regular files under their directory (symlinks
 * resolved), and never a dot-segment (`.git`, `.env`, `..`). The self-host
 * access gate (middleware) covers these routes like every other API route.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "node:path";
import { Readable } from "node:stream";
import { isBrowserPlugin, type PluginsRegistry } from "tongflow";

export const EDGE_PLUGIN_FILES_BASE = "/api/plugins/files";

/** The public model base edge plugins download weights from by default. */
export const DEFAULT_EDGE_MODEL_BASE = "https://models.ctsource.cn/";

/** What the page needs to run browser plugins (`GET /api/plugins/edge`). */
export interface EdgePluginsInfo {
    /** `?modelBase=` handed to every plugin entry. */
    modelBase: string;
    /** The app sends COOP / COEP (`TONGFLOW_CROSS_ORIGIN_ISOLATION`). */
    crossOriginIsolated: boolean;
    plugins: Record<
        string,
        {
            version: string;
            /** Same-origin URL of the plugin directory, trailing slash. */
            base: string;
            entryUrl: string;
            /** `models.json` (model ids, download sizes), when shipped. */
            modelsUrl?: string;
        }
    >;
}

const MIME: Record<string, string> = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".cjs": "text/javascript; charset=utf-8",
    ".wasm": "application/wasm",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    // Never rendered as a page of the app's origin.
    ".html": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

export function edgePluginFileMime(path: string): string {
    return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export function crossOriginIsolationEnabled(): boolean {
    return /^(1|true|yes|on)$/i.test(
        process.env.TONGFLOW_CROSS_ORIGIN_ISOLATION?.trim() ?? "",
    );
}

export function edgeModelBase(): string {
    return (
        process.env.TONGFLOW_EDGE_MODEL_BASE?.trim() || DEFAULT_EDGE_MODEL_BASE
    );
}

/**
 * A safe relative path inside a plugin directory, or `null`: no empty,
 * `.`-prefixed (`..`, `.git`), backslash or NUL segment, not absolute.
 */
export function safePluginPath(rel: string): string | null {
    if (!rel || isAbsolute(rel) || rel.includes("\0") || rel.includes("\\"))
        return null;
    const segs = rel.split("/");
    if (segs.some((s) => !s || s.startsWith("."))) return null;
    return segs.join("/");
}

/** The file `rel` names under `pluginDir`, or `null` (outside, also via a symlink; not a file; unsafe). */
export async function resolvePluginFile(
    pluginDir: string,
    rel: string,
): Promise<string | null> {
    const safe = safePluginPath(rel);
    if (!safe) return null;
    try {
        const root = await realpath(pluginDir);
        const abs = await realpath(join(root, safe));
        const inside = relative(root, abs);
        if (!inside || inside.startsWith("..") || isAbsolute(inside))
            return null;
        if (!(await stat(abs)).isFile()) return null;
        return abs;
    } catch {
        return null;
    }
}

const VERSION_FILES = ["tongflow.plugin.json", "package.json", "models.json"];
const versionCache = new Map<string, { stamp: string; version: string }>();

async function gitHead(dir: string): Promise<string> {
    try {
        const head = (await readFile(join(dir, ".git", "HEAD"), "utf8")).trim();
        const ref = /^ref: (.+)$/.exec(head)?.[1];
        if (!ref) return head;
        try {
            return (await readFile(join(dir, ".git", ref), "utf8")).trim();
        } catch {
            const packed = await readFile(
                join(dir, ".git", "packed-refs"),
                "utf8",
            );
            const line = packed
                .split("\n")
                .find((l) => l.trim().endsWith(` ${ref}`));
            return line?.split(" ")[0] ?? head;
        }
    } catch {
        return "";
    }
}

/** 12 hex chars over the plugin's manifest, entry, package.json, models.json and git HEAD. */
export async function edgePluginVersion(
    pluginDir: string,
    entryFile: string,
): Promise<string> {
    const files = [...VERSION_FILES, entryFile];
    const stats = await Promise.all(
        [...files, ".git/HEAD"].map((f) =>
            stat(join(pluginDir, f)).then(
                (s) => `${f}:${s.size}:${s.mtimeMs}`,
                () => `${f}:-`,
            ),
        ),
    );
    const head = await gitHead(pluginDir);
    const stamp = `${stats.join("|")}|${head}`;
    const hit = versionCache.get(pluginDir);
    if (hit?.stamp === stamp) return hit.version;
    const h = createHash("sha256");
    for (const f of files) {
        h.update(`${f}\0`);
        try {
            h.update(await readFile(join(pluginDir, f)));
        } catch {
            h.update("-");
        }
    }
    h.update(`\0${head}`);
    const version = h.digest("hex").slice(0, 12);
    versionCache.set(pluginDir, { stamp, version });
    return version;
}

const encodePath = (p: string) =>
    p.split("/").map(encodeURIComponent).join("/");

/** The installed browser plugins and the URLs they are served under. */
export async function edgePluginsInfo(
    registry: Pick<PluginsRegistry, "plugins">,
    pluginsDir: string,
): Promise<EdgePluginsInfo> {
    const plugins: EdgePluginsInfo["plugins"] = {};
    for (const [id, plugin] of Object.entries(registry.plugins)) {
        if (!isBrowserPlugin(plugin) || !plugin.entryFile) continue;
        const dir = join(pluginsDir, plugin.localSubdir);
        const version = await edgePluginVersion(dir, plugin.entryFile);
        const base = `${EDGE_PLUGIN_FILES_BASE}/${encodeURIComponent(id)}/${version}/`;
        const hasModels = await stat(join(dir, "models.json")).then(
            (s) => s.isFile(),
            () => false,
        );
        plugins[id] = {
            version,
            base,
            entryUrl: `${base}${encodePath(plugin.entryFile)}`,
            ...(hasModels ? { modelsUrl: `${base}models.json` } : {}),
        };
    }
    return {
        modelBase: edgeModelBase(),
        crossOriginIsolated: crossOriginIsolationEnabled(),
        plugins,
    };
}

function notFound(): Response {
    return Response.json({ error: "File not found" }, { status: 404 });
}

/**
 * `GET /api/plugins/files/<pluginId>/<version>/<path>`: one file of an
 * installed browser plugin, with single-range `Range` support (206 / 416).
 * `segments` are the decoded path segments after `/api/plugins/files/`.
 */
export async function serveEdgePluginFile(
    request: Request,
    segments: readonly string[],
    registry: Pick<PluginsRegistry, "plugins">,
    pluginsDir: string,
): Promise<Response> {
    const [pluginId, version, ...rest] = segments;
    if (!pluginId || !version || rest.length === 0) return notFound();
    const plugin = Object.hasOwn(registry.plugins, pluginId)
        ? registry.plugins[pluginId]
        : undefined;
    if (!plugin || !isBrowserPlugin(plugin)) return notFound();
    const dir = join(pluginsDir, plugin.localSubdir);
    const path = await resolvePluginFile(dir, rest.join("/"));
    if (!path) return notFound();
    const current =
        !!plugin.entryFile &&
        version === (await edgePluginVersion(dir, plugin.entryFile));
    const size = (await stat(path)).size;
    const headers: Record<string, string> = {
        "Content-Type": edgePluginFileMime(path),
        "Accept-Ranges": "bytes",
        "Cache-Control": current
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        ...(crossOriginIsolationEnabled()
            ? {
                  "Cross-Origin-Embedder-Policy": "require-corp",
                  "Cross-Origin-Opener-Policy": "same-origin",
              }
            : {}),
    };
    const head = request.method === "HEAD";
    const range = request.headers.get("range");
    if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        let start: number | undefined;
        let end: number | undefined;
        if (m && (m[1] || m[2])) {
            if (!m[1]) {
                start = Math.max(0, size - Number(m[2]));
                end = size - 1;
            } else {
                start = Number(m[1]);
                end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
            }
        }
        if (
            start === undefined ||
            end === undefined ||
            start > end ||
            start >= size
        ) {
            return new Response(null, {
                status: 416,
                headers: { "Content-Range": `bytes */${size}` },
            });
        }
        return new Response(head ? null : stream(path, { start, end }), {
            status: 206,
            headers: {
                ...headers,
                "Content-Range": `bytes ${start}-${end}/${size}`,
                "Content-Length": String(end - start + 1),
            },
        });
    }
    return new Response(head ? null : stream(path), {
        status: 200,
        headers: { ...headers, "Content-Length": String(size) },
    });
}

function stream(
    path: string,
    range?: { start: number; end: number },
): ReadableStream<Uint8Array> {
    return Readable.toWeb(
        createReadStream(path, range),
    ) as ReadableStream<Uint8Array>;
}
