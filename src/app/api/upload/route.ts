/**
 * POST /api/upload
 * Local file upload endpoint.
 * Saves files to data/uploads/ directory.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { dataDir } from "@/lib/runtime/paths.server";

const UPLOAD_DIR = path.join(dataDir(), "uploads");

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 },
            );
        }

        // Generate unique file key
        const ext = path.extname(file.name) || "";
        const fileKey = `${nanoid()}${ext}`;

        // Ensure upload directory exists
        await mkdir(UPLOAD_DIR, { recursive: true });

        // Write file to disk
        const filePath = path.join(UPLOAD_DIR, fileKey);
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(filePath, buffer);

        const url = `/api/uploads/${fileKey}`;

        return NextResponse.json({
            fileKey,
            url,
            size: file.size,
            name: file.name,
        });
    } catch (error) {
        logger.error("[API /api/upload] Error:", error);
        return NextResponse.json(
            { error: "Failed to upload file" },
            { status: 500 },
        );
    }
}
