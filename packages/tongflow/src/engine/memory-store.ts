/**
 * In-memory {@link AssetStore}, the counterpart of Python's `MemoryStore`:
 * outputs live in a map under `mem://<id>` handles. Tests, and hosts that
 * keep a run's files only for the page's lifetime, use it.
 */

import type { AssetPutMeta, AssetStore, FileRefPayload } from "./types";

export const MEMORY_SCHEME = "mem://";

function newId(): string {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

export class MemoryAssetStore implements AssetStore {
    private readonly blobs = new Map<string, Uint8Array>();

    /**
     * `seed` preloads files under arbitrary keys (e.g. `uploads/a.png`), the
     * way a host's uploads sit on disk for the Python engine. Only `mem://`
     * handles count as {@link owns owned}.
     */
    constructor(seed?: Record<string, Uint8Array>) {
        for (const [key, bytes] of Object.entries(seed ?? {})) {
            this.blobs.set(key, bytes);
        }
    }

    async put(bytes: Uint8Array, meta: AssetPutMeta): Promise<FileRefPayload> {
        const key = `${MEMORY_SCHEME}${newId()}`;
        this.blobs.set(key, bytes);
        const ref: FileRefPayload = { file_key: key };
        if (meta.mime) ref.mime = meta.mime;
        if (meta.filename) ref.filename = meta.filename;
        return ref;
    }

    async get(fileKey: string): Promise<Uint8Array | null> {
        return this.blobs.get(fileKey) ?? null;
    }

    owns(fileKey: string): boolean {
        return fileKey.startsWith(MEMORY_SCHEME);
    }

    /** Store bytes under a caller-chosen key (an upload). */
    set(fileKey: string, bytes: Uint8Array): void {
        this.blobs.set(fileKey, bytes);
    }

    delete(fileKey: string): boolean {
        return this.blobs.delete(fileKey);
    }

    get size(): number {
        return this.blobs.size;
    }
}
