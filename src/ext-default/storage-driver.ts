import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { StorageDriver } from "@/lib/file/storage.server";
import { scopedDataDir } from "@/lib/runtime/scope.server";

/**
 * Default storage driver: files on the local disk under the scoped uploads
 * directory (`<scopedDataDir>/uploads/`) — the historical behavior. A
 * cloud shell substitutes e.g. an object-storage driver via
 * `src/ext/storage-driver.ts`.
 */

async function uploadsRoot(): Promise<string> {
    return path.join(await scopedDataDir(), "uploads");
}

export const storageDriver: StorageDriver = {
    async saveFile(data, ext, taskId, options) {
        const root = await uploadsRoot();
        const base = taskId ? path.join(root, "tasks", taskId) : root;
        // A named output keeps its name: `<id>/<name>` (the caller passes a
        // `storeKeyName`, already free of separators); else `<id>.<ext>`.
        const name = options?.name;
        const safe = name && !/[/\\]/.test(name) && !name.startsWith(".");
        const dir = safe ? path.join(base, nanoid()) : base;
        await mkdir(dir, { recursive: true });

        const filename = safe ? name : ext ? `${nanoid()}.${ext}` : nanoid();
        const filePath = path.join(dir, filename);
        await writeFile(filePath, data);

        // The fileKey is the path relative to the uploads root.
        return path.relative(root, filePath);
    },

    async readFile(fileKey) {
        const root = await uploadsRoot();
        const normalized = fileKey.replace(/^\/+/, "").replace(/\\/g, "/");
        const resolved = path.resolve(
            root,
            ...normalized.split("/").filter(Boolean),
        );
        if (!resolved.startsWith(root)) {
            throw new Error("Invalid file key");
        }
        return readFile(resolved);
    },
};
