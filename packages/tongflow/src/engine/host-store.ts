/**
 * {@link AssetStore} over a TongFlow host's own file storage (Studio project
 * files, the Next app's uploads), for hosts whose canvas files already live on
 * the server:
 *
 * - `get(key)` reads a host file key (an upload dropped onto the canvas, an
 *   earlier run's output) over HTTP, so an edge node gets the bytes in the
 *   browser when it needs them;
 * - `put(bytes)` uploads a node's binary output through the host's upload
 *   endpoint and returns the host key, so the canvas shows it with its usual
 *   `resolveAssetUrl`, a saved workflow keeps a key the server can read, and a
 *   Python node (remote executor) or a later server run can consume it.
 *
 * Bytes it has seen are kept in a small in-memory LRU, so a file uploaded by
 * one node and read by the next is not downloaded again. Platform neutral:
 * only `fetch`.
 */

import type { AssetPutMeta, AssetStore, FileRefPayload } from "./types";

export interface HostAssetStoreOptions {
    /**
     * The URL a host file key is read from, or `null` when the key is not one
     * of the host's (the store then answers `null`: unknown). Usually the
     * canvas's own `resolveAssetUrl`.
     */
    resolveUrl: (fileKey: string) => string | null;
    /** Upload one output; resolve the host file key it is stored under. */
    upload: (bytes: Uint8Array, meta: AssetPutMeta) => Promise<string>;
    /** Default `globalThis.fetch`. Requests are same-origin with credentials. */
    fetch?: (url: string, init?: RequestInit) => Promise<Response>;
    /** Upper bound of the in-memory byte cache. Default 256 MiB; 0 disables it. */
    cacheBytes?: number;
}

export interface HostAssetStore extends AssetStore {
    /** Drop every cached byte (the host files stay). */
    clearCache(): void;
}

const DEFAULT_CACHE_BYTES = 256 * 1024 * 1024;

export function createHostAssetStore(
    options: HostAssetStoreOptions,
): HostAssetStore {
    const limit = options.cacheBytes ?? DEFAULT_CACHE_BYTES;
    const doFetch = options.fetch ?? ((url, init) => fetch(url, init));
    // Map iteration order is insertion order: the first entry is the least
    // recently used one.
    const cache = new Map<string, Uint8Array>();
    let cached = 0;
    const issued = new Set<string>();
    const inflight = new Map<string, Promise<Uint8Array | null>>();

    const remember = (key: string, bytes: Uint8Array) => {
        if (bytes.byteLength > limit) return;
        const old = cache.get(key);
        if (old) {
            cached -= old.byteLength;
            cache.delete(key);
        }
        cache.set(key, bytes);
        cached += bytes.byteLength;
        for (const [k, v] of cache) {
            if (cached <= limit) break;
            cache.delete(k);
            cached -= v.byteLength;
        }
    };

    const download = async (key: string): Promise<Uint8Array | null> => {
        const url = options.resolveUrl(key);
        if (!url) return null;
        const res = await doFetch(url, { credentials: "same-origin" });
        if (res.status === 404) return null;
        if (!res.ok) {
            throw new Error(
                `HTTP Error ${res.status} reading host file '${key}'`,
            );
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        remember(key, bytes);
        return bytes;
    };

    return {
        async put(bytes, meta) {
            const key = await options.upload(bytes, meta);
            issued.add(key);
            remember(key, bytes);
            const ref: FileRefPayload = { file_key: key };
            if (meta.mime) ref.mime = meta.mime;
            if (meta.filename) ref.filename = meta.filename;
            return ref;
        },
        async get(fileKey) {
            const hit = cache.get(fileKey);
            if (hit) {
                cache.delete(fileKey);
                cache.set(fileKey, hit);
                return hit;
            }
            let pending = inflight.get(fileKey);
            if (!pending) {
                pending = download(fileKey).finally(() =>
                    inflight.delete(fileKey),
                );
                inflight.set(fileKey, pending);
            }
            return pending;
        },
        owns: (fileKey) => issued.has(fileKey),
        clearCache() {
            cache.clear();
            cached = 0;
        },
    };
}
