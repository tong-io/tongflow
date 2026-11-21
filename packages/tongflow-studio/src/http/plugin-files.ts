/**
 * Serving installed browser edge plugins (`runtime: "browser"`,
 * `tongflow-edge-*`) to the page, same-origin, so the edge executor can load
 * a plugin's ESM entry in a module Web Worker and the entry can fetch its
 * `dist/` chunks and assets (wasm, fonts, CMaps) next to it.
 *
 * URL layout (under the studio prefix):
 *
 *   /plugins/files/<pluginId>/<version>/<path inside the plugin dir>
 *
 * `<version>` is a content hash of the plugin (manifest, entry, package.json,
 * models.json and the git HEAD): every relative URL the entry resolves keeps
 * it, so the whole plugin can be cached `immutable`, and an update (a new
 * hash) is a new URL — `index.js` is never served stale. A request for any
 * other version still gets the current file, with `no-cache`.
 *
 * Only plugins the registry lists as `runtime: "browser"` are served, only
 * regular files under their directory (after resolving symlinks), and never a
 * dot-segment (`.git`, `.env`, `..`).
 */
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "node:path";

export const PLUGIN_FILES_PATH = "/plugins/files";

/** The public model base edge plugins download weights from by default. */
export const DEFAULT_EDGE_MODEL_BASE = "https://models.ctsource.cn/";

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
    // Never rendered as a page of the studio's origin.
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

export function pluginFileMime(path: string): string {
    return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
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

/**
 * The file a request names, or `null` when it is outside the plugin
 * directory (also through a symlink), not a regular file, or unsafe.
 */
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

const VERSION_FILES = [
    "tongflow.plugin.json",
    "package.json",
    "models.json",
] as const;

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

/**
 * The plugin's version segment: 12 hex chars of a hash over its manifest,
 * entry, package.json, models.json and git HEAD. Recomputed only when one of
 * those files' size or mtime changed.
 */
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

/** Response headers for a plugin file. */
export function pluginFileHeaders(options: {
    path: string;
    /** The request named the plugin's current version. */
    current: boolean;
    /** The page is served cross-origin isolated (COEP applies to workers too). */
    crossOriginIsolation?: boolean;
}): Record<string, string> {
    return {
        "content-type": pluginFileMime(options.path),
        "cache-control": options.current
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "same-origin",
        ...(options.crossOriginIsolation
            ? {
                  "cross-origin-embedder-policy": "require-corp",
                  "cross-origin-opener-policy": "same-origin",
              }
            : {}),
    };
}
