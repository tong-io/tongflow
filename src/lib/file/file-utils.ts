/**
 * File utility functions
 *
 * Replaces R2 by saving files to the local data/uploads/ directory.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { dataDir } from "@/lib/runtime/paths.server";

const UPLOADS_DIR = path.join(dataDir(), "uploads");

/**
 * Read a file under `data/uploads/` by its fileKey (same as in {@link getFileUrl}).
 * Rejects path traversal.
 */
export async function readUploadFileByFileKey(
    fileKey: string,
): Promise<Buffer> {
    const normalized = fileKey.replace(/^\/+/, "").replace(/\\/g, "/");
    const resolved = path.resolve(
        UPLOADS_DIR,
        ...normalized.split("/").filter(Boolean),
    );
    if (!resolved.startsWith(UPLOADS_DIR)) {
        throw new Error("Invalid file key");
    }
    return readFile(resolved);
}

/**
 * Save byte data locally and return the fileKey
 */
export async function saveFile(
    data: Buffer | Uint8Array,
    ext: string,
    taskId?: string,
): Promise<string> {
    const dir = taskId ? path.join(UPLOADS_DIR, "tasks", taskId) : UPLOADS_DIR;

    await mkdir(dir, { recursive: true });

    const filename = `${nanoid()}.${ext}`;
    const filePath = path.join(dir, filename);

    await writeFile(filePath, data);

    // Return the path relative to the uploads root directory as the fileKey
    return path.relative(UPLOADS_DIR, filePath);
}

/**
 * Download a file from a URL and save it locally
 */
export async function downloadAndSave(
    url: string,
    ext: string,
    taskId?: string,
): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Download failed: ${response.status} ${response.statusText}`,
        );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return saveFile(buffer, ext, taskId);
}

/**
 * Get the public access URL for a file (relative path)
 */
export function getFileUrl(fileKey: string): string {
    return `/api/uploads/${fileKey}`;
}
