/**
 * {@link AssetStore} on the browser's Origin Private File System. Files stay
 * on the user's device and survive reloads. An output with a `filename` is
 * keyed `opfs://<id>/<name>` and stored as `<directory>/<id>/<name>`, `<name>`
 * being the producer's sanitized filename ({@link storeKeyName}): a
 * downstream node receives the same filename (and the mime its extension
 * implies). An output without one is keyed `opfs://<id>.<ext>`, a flat file,
 * which is also the form every key had before; both forms resolve.
 */

import { storeKeyName } from "../assets";
import type { AssetPutMeta, AssetStore, FileRefPayload } from "../types";

export const OPFS_SCHEME = "opfs://";

export interface OpfsAssetStoreOptions {
    /** Sub-directory of the OPFS root holding the files. Default `tongflow-assets`. */
    directory?: string;
    /** OPFS root; defaults to `navigator.storage.getDirectory()`. Injectable for tests. */
    root?: () => Promise<FileSystemDirectoryHandle>;
}

function newId(): string {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
}

function isNotFound(e: unknown): boolean {
    return (
        typeof e === "object" &&
        e !== null &&
        ((e as { name?: unknown }).name === "NotFoundError" ||
            (e as { name?: unknown }).name === "TypeMismatchError")
    );
}

export class OpfsAssetStore implements AssetStore {
    private readonly directory: string;
    private readonly root: () => Promise<FileSystemDirectoryHandle>;
    private dirPromise: Promise<FileSystemDirectoryHandle> | null = null;

    constructor(options: OpfsAssetStoreOptions = {}) {
        this.directory = options.directory ?? "tongflow-assets";
        this.root = options.root ?? (() => navigator.storage.getDirectory());
    }

    private dir(): Promise<FileSystemDirectoryHandle> {
        if (!this.dirPromise) {
            this.dirPromise = this.root()
                .then((root) =>
                    root.getDirectoryHandle(this.directory, { create: true }),
                )
                .catch((e) => {
                    this.dirPromise = null;
                    throw e;
                });
        }
        return this.dirPromise;
    }

    /**
     * Where a key this store issued lives: a flat file (`opfs://<id>.<ext>`)
     * or a file in a per-id directory (`opfs://<id>/<name>`); else `null`.
     */
    private locate(fileKey: string): { dir?: string; file: string } | null {
        if (!this.owns(fileKey)) return null;
        const parts = fileKey.slice(OPFS_SCHEME.length).split("/");
        if (parts.some((p) => !p || p === "." || p === "..")) return null;
        if (parts.length === 1) return { file: parts[0] };
        if (parts.length === 2) return { dir: parts[0], file: parts[1] };
        return null;
    }

    async put(bytes: Uint8Array, meta: AssetPutMeta): Promise<FileRefPayload> {
        const ext = meta.ext.replace(/^\.+/, "") || "bin";
        const id = newId();
        const named = storeKeyName(meta.filename, ext);
        const key = named ? `${id}/${named}` : `${id}.${ext}`;
        let dir = await this.dir();
        if (named) dir = await dir.getDirectoryHandle(id, { create: true });
        const handle = await dir.getFileHandle(named ?? key, { create: true });
        if (typeof handle.createWritable !== "function") {
            throw new Error(
                "OPFS store: FileSystemFileHandle.createWritable is not supported in this browser",
            );
        }
        const writable = await handle.createWritable();
        await writable.write(bytes as unknown as BufferSource);
        await writable.close();
        const ref: FileRefPayload = { file_key: `${OPFS_SCHEME}${key}` };
        if (meta.mime) ref.mime = meta.mime;
        if (meta.filename) ref.filename = meta.filename;
        return ref;
    }

    async get(fileKey: string): Promise<Uint8Array | null> {
        const at = this.locate(fileKey);
        if (!at) return null;
        try {
            let dir = await this.dir();
            if (at.dir) dir = await dir.getDirectoryHandle(at.dir);
            const file = await (await dir.getFileHandle(at.file)).getFile();
            return new Uint8Array(await file.arrayBuffer());
        } catch (e) {
            if (isNotFound(e)) return null;
            throw e;
        }
    }

    owns(fileKey: string): boolean {
        return fileKey.startsWith(OPFS_SCHEME);
    }

    /** Remove one file; `false` when the key is unknown. */
    async delete(fileKey: string): Promise<boolean> {
        const at = this.locate(fileKey);
        if (!at) return false;
        try {
            const dir = await this.dir();
            if (at.dir) {
                // Make sure the named file is there before dropping its directory.
                await (await dir.getDirectoryHandle(at.dir)).getFileHandle(
                    at.file,
                );
                await dir.removeEntry(at.dir, { recursive: true });
            } else {
                await dir.removeEntry(at.file);
            }
            return true;
        } catch (e) {
            if (isNotFound(e)) return false;
            throw e;
        }
    }

    /** Remove every file this store holds. */
    async clear(): Promise<void> {
        const root = await this.root();
        try {
            await root.removeEntry(this.directory, { recursive: true });
        } catch (e) {
            if (!isNotFound(e)) throw e;
        }
        this.dirPromise = null;
    }
}
