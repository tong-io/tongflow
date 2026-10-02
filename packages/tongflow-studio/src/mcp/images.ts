/**
 * An image as MCP content. Tool results travel as base64 inside one JSON
 * message, so a generated image of several megabytes is scaled down with
 * ffmpeg first; the full file stays on disk for anything that needs it.
 */
import { execFile as execFileCb } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ToolImage } from "../tools/spec.ts";

const execFile = promisify(execFileCb);

/** Above this an image is scaled down before it is inlined. */
const INLINE_BYTES = 1_000_000;
/** Above this an image that could not be scaled down is not inlined at all. */
const MAX_BYTES = 3_500_000;
/** Longest edge of a scaled-down image, in pixels. */
const MAX_EDGE = 1568;

type ImageContent =
    | { type: "image"; data: string; mimeType: string }
    | { type: "text"; text: string };

export async function inlineImage(
    image: ToolImage,
    tmpDir: string,
): Promise<ImageContent> {
    if (image.data.byteLength <= INLINE_BYTES) return content(image);
    const small = await shrink(image, tmpDir).catch(() => undefined);
    if (small) return content(small);
    if (image.data.byteLength <= MAX_BYTES) return content(image);
    return {
        type: "text",
        text: `(${image.name ?? "the image"} is too large to show inline and ffmpeg could not scale it down — read the file at the path above instead)`,
    };
}

function content(image: Pick<ToolImage, "data" | "mediaType">): ImageContent {
    return {
        type: "image",
        data: Buffer.from(image.data).toString("base64"),
        mimeType: image.mediaType,
    };
}

async function shrink(
    image: ToolImage,
    tmpDir: string,
): Promise<Pick<ToolImage, "data" | "mediaType">> {
    const stem = join(tmpDir, `inline-${randomUUID().slice(0, 8)}`);
    const source = `${stem}.src`;
    const target = `${stem}.jpg`;
    try {
        await writeFile(source, image.data);
        await execFile("ffmpeg", [
            "-v",
            "error",
            "-y",
            "-i",
            source,
            "-vf",
            `scale='min(${MAX_EDGE},iw)':'min(${MAX_EDGE},ih)':force_original_aspect_ratio=decrease`,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            target,
        ]);
        return {
            data: new Uint8Array(await readFile(target)),
            mediaType: "image/jpeg",
        };
    } finally {
        await unlink(source).catch(() => undefined);
        await unlink(target).catch(() => undefined);
    }
}
