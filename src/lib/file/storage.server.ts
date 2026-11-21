import "server-only";

import { storageDriver } from "@ext/storage-driver";

/**
 * Storage driver seam.
 *
 * The driver is resolved statically via `@ext/storage-driver`: the default
 * (src/ext-default/storage-driver.ts) stores files on the local disk under
 * the scoped uploads directory — the historical behavior — and a cloud
 * shell links its own (e.g. object storage) implementation.
 *
 * `registerStorageDriver` remains as a runtime override hook (kept on
 * globalThis because instrumentation is compiled as a separate bundle from
 * route handlers).
 */

export interface StorageDriver {
    /**
     * Persist bytes and return the fileKey (path relative to the uploads
     * root, e.g. `tasks/<taskId>/<id>.png`). With `options.name` (a
     * `storeKeyName` from `tongflow/engine`), the key must end in that name
     * as its last path segment (`<id>/<name>`), so the producer's filename
     * reaches downstream nodes (docs/edge-runtime.md, "Asset store keys").
     */
    saveFile(
        data: Buffer | Uint8Array,
        ext: string,
        taskId?: string,
        options?: { name?: string },
    ): Promise<string>;
    /** Read bytes by fileKey. Throws on missing files and invalid keys. */
    readFile(fileKey: string): Promise<Buffer>;
    /**
     * True when files do not live on the local uploads dir. The engine
     * delegate then routes the SDK engine's asset IO through the
     * `/api/engine-assets` loopback sink instead of a local out_dir.
     */
    remote?: boolean;
    /**
     * Optional directly-fetchable URL for a fileKey (e.g. a presigned
     * object-storage URL). The uploads route 302s to it when present;
     * return null to stream bytes via the app instead.
     */
    publicUrl?(fileKey: string): Promise<string | null>;
}

const DRIVER_KEY = Symbol.for("tongflow.storage.driver");

type DriverGlobal = { [DRIVER_KEY]?: StorageDriver };

/** Replace the storage backend at runtime (overrides the linked driver). */
export function registerStorageDriver(next: StorageDriver): void {
    (globalThis as DriverGlobal)[DRIVER_KEY] = next;
}

export function getStorage(): StorageDriver {
    return (globalThis as DriverGlobal)[DRIVER_KEY] ?? storageDriver;
}
