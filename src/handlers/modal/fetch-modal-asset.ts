/**
 * Fetch media bytes for Modal GPU handlers (local uploads + remote URLs).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getR2Url } from "@/lib/r2-utils";

export async function fetchModalAssetBytes(url: string): Promise<Uint8Array> {
    if (url.startsWith("/api/uploads/")) {
        const rel = url.replace(/^\/api\/uploads\//, "");
        const uploadsDir = path.resolve(process.cwd(), "data", "uploads");
        const filePath = path.join(uploadsDir, rel);
        if (!filePath.startsWith(uploadsDir)) {
            throw new Error("Invalid uploads path");
        }
        const buf = await readFile(filePath);
        return new Uint8Array(buf);
    }

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to download asset: ${resp.status}`);
    return new Uint8Array(await resp.arrayBuffer());
}

/**
 * Resolve a stored object key (or URL) to bytes — same contract as GPU handlers
 * (open-source: keys under data/uploads; prod: full URL or R2-backed path).
 */
export async function fetchModalAssetByFileKey(
    fileKey: string,
): Promise<Uint8Array> {
    const k = typeof fileKey === "string" ? fileKey.trim() : "";
    if (!k) {
        throw new Error("Missing fileKey");
    }
    if (k.startsWith("http://") || k.startsWith("https://")) {
        return fetchModalAssetBytes(k);
    }
    if (k.startsWith("/api/uploads/")) {
        return fetchModalAssetBytes(k);
    }
    const url = getR2Url(k);
    if (url.startsWith("/api/uploads/")) {
        return fetchModalAssetBytes(url);
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return fetchModalAssetBytes(url);
    }
    return fetchModalAssetBytes(
        url.startsWith("/") ? url : `/api/uploads/${k}`,
    );
}
