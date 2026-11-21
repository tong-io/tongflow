/**
 * {@link AssetStore} on the browser's Origin Private File System. Files stay
 * on the user's device, survive reloads, and are keyed `opfs://<id>.<ext>`
 * (the extension keeps the mime recoverable when a file is read back as an
 * Asset input).
 */

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

    /** The OPFS file name behind a key this store issued, else `null`. */
    private fileName(fileKey: string): string | null {
        if (!this.owns(fileKey)) return null;
        const name = fileKey.slice(OPFS_SCHEME.length);
        return name && !name.includes("/") ? name : null;
    }

    async put(bytes: Uint8Array, meta: AssetPutMeta): Promise<FileRefPayload> {
        const ext = meta.ext.replace(/^\.+/, "") || "bin";
        const name = `${newId()}.${ext}`;
        const dir = await this.dir();
        const handle = await dir.getFileHandle(name, { create: true });
        if (typeof handle.createWritable !== "function") {
            throw new Error(
                "OPFS store: FileSystemFileHandle.createWritable is not supported in this browser",
            );
        }
        const writable = await handle.createWritable();
        await writable.write(bytes as unknown as BufferSource);
        await writable.close();
        const ref: FileRefPayload = { file_key: `${OPFS_SCHEME}${name}` };
        if (meta.mime) ref.mime = meta.mime;
        if (meta.filename) ref.filename = meta.filename;
        return ref;
    }

    async get(fileKey: string): Promise<Uint8Array | null> {
        const name = this.fileName(fileKey);
        if (!name) return null;
        try {
            const dir = await this.dir();
            const file = await (await dir.getFileHandle(name)).getFile();
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
        const name = this.fileName(fileKey);
        if (!name) return false;
        try {
            await (await this.dir()).removeEntry(name);
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
