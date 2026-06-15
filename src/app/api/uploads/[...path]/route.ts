/**
 * GET /api/uploads/[...path]
 * Serve uploaded files from local storage.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { dataDir } from "@/lib/runtime/paths.server";

const UPLOAD_DIR = path.join(dataDir(), "uploads");

const MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".json": "application/json",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
) {
    try {
        const { path: pathSegments } = await params;
        const filePath = path.join(UPLOAD_DIR, ...pathSegments);

        // Prevent directory traversal
        if (!filePath.startsWith(UPLOAD_DIR)) {
            return NextResponse.json(
                { error: "Invalid path" },
                { status: 400 },
            );
        }

        const buffer = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (_error) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}
