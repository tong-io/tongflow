/** Static file serving with HTTP Range support (video scrubbing) for project files. */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname } from "node:path";
import { HttpError } from "./util.ts";

const MIME: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    flac: "audio/flac",
    json: "application/json; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    srt: "text/plain; charset=utf-8",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
    ply: "application/octet-stream",
    splat: "application/octet-stream",
    pdf: "application/pdf",
};

export function mimeFor(path: string): string {
    return (
        MIME[extname(path).slice(1).toLowerCase()] ?? "application/octet-stream"
    );
}

export async function serveFile(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
): Promise<void> {
    let st: Awaited<ReturnType<typeof stat>>;
    try {
        st = await stat(path);
    } catch {
        throw new HttpError(404, "file not found");
    }
    if (!st.isFile()) throw new HttpError(404, "not a file");
    const size = st.size;
    const type = mimeFor(path);
    const headers: Record<string, string | number> = {
        "content-type": type,
        "accept-ranges": "bytes",
        "cache-control": "no-cache",
        "last-modified": st.mtime.toUTCString(),
    };
    const range = req.headers.range;
    if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (!m) {
            res.writeHead(416, { "content-range": `bytes */${size}` });
            res.end();
            return;
        }
        let start = m[1] ? Number(m[1]) : undefined;
        let end = m[2] ? Number(m[2]) : undefined;
        if (start === undefined && end !== undefined) {
            start = Math.max(0, size - end);
            end = size - 1;
        } else {
            start = start ?? 0;
            end = end === undefined || end >= size ? size - 1 : end;
        }
        if (start > end || start >= size) {
            res.writeHead(416, { "content-range": `bytes */${size}` });
            res.end();
            return;
        }
        res.writeHead(206, {
            ...headers,
            "content-range": `bytes ${start}-${end}/${size}`,
            "content-length": end - start + 1,
        });
        if (req.method === "HEAD") {
            res.end();
            return;
        }
        createReadStream(path, { start, end }).pipe(res);
        return;
    }
    res.writeHead(200, { ...headers, "content-length": size });
    if (req.method === "HEAD") {
        res.end();
        return;
    }
    createReadStream(path).pipe(res);
}
