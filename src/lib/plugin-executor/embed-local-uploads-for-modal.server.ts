import "server-only";

import path from "node:path";
import { readUploadFileByFileKey } from "@/utils/file-utils";

/**
 * Openflow stores images locally in `data/uploads`, while the frontend sends `/api/uploads/<fileKey>`.
 * Modal cannot access that URL in the cloud; the server must read the file from disk and put it into the payload (usually base64),
 * then send it to the remote side through Modal `spawn` serializable arguments. This is not a streaming direct connection between the browser and Modal.
 */

const URL_FIELD_TO_B64: { urlKey: string; b64Key: string }[] = [
    { urlKey: "image", b64Key: "image_base64" },
    { urlKey: "start_image", b64Key: "image_base64" },
    { urlKey: "end_image", b64Key: "end_image_base64" },
    { urlKey: "audio", b64Key: "audio_base64" },
    { urlKey: "speech", b64Key: "speech_base64" },
];

function stripDataUrlToBase64(s: string): string | null {
    const t = s.trim();
    if (!t.startsWith("data:") || !t.includes(",")) return null;
    const rest = t.split(",", 2)[1];
    return rest?.trim() ?? null;
}

/** `/api/uploads/x`, `https://host/api/uploads/x`, or bare `tasks/.../a.png` fileKey */
export function parseOpenflowUploadsFileKey(raw: string): string | null {
    const t = raw.trim();
    if (!t) return null;
    const prefix = "/api/uploads/";
    if (t.startsWith(prefix)) {
        return t.slice(prefix.length);
    }
    if (t.startsWith("http://") || t.startsWith("https://")) {
        try {
            const u = new URL(t);
            if (u.pathname.startsWith(prefix)) {
                return u.pathname.slice(prefix.length);
            }
        } catch {
            return null;
        }
        return null;
    }
    if (!t.startsWith("/") && !t.includes("://") && t.includes("/")) {
        return t;
    }
    return null;
}

function firstUploadFileKey(raw: unknown): string | null {
    if (typeof raw !== "string" || !raw.trim()) return null;
    return parseOpenflowUploadsFileKey(raw.trim());
}

/**
 * CPU FFmpeg (and similar) prompts use `fileKey` / `videoKey` / R2 keys; Openflow keeps
 * bytes in `data/uploads` only. Embed as `video_bytes` so Modal never calls HeadObject on
 * a key that exists only on the Next server disk.
 */
async function embedVideoBytesFromFileKeyFields(
    out: Record<string, unknown>,
): Promise<void> {
    if (out["video_bytes"] != null) return;

    const candidates = ["fileKey", "videoKey"] as const;
    for (const field of candidates) {
        const fk = firstUploadFileKey(out[field]);
        if (!fk) continue;
        const buf = await readUploadFileByFileKey(fk);
        out["video_bytes"] = buf.toString("base64");
        if (typeof out["video_filename"] !== "string" || !out["video_filename"]) {
            out["video_filename"] = path.basename(fk);
        }
        return;
    }
}

/** merge_video_audio: `video_key` + `audio_key` from local uploads */
async function embedMergeKeysFromLocalUploads(
    out: Record<string, unknown>,
): Promise<void> {
    const vRaw = out["video_key"];
    const aRaw = out["audio_key"];
    if (out["video_bytes"] != null && out["audio_bytes"] != null) return;

    const vfk = firstUploadFileKey(vRaw);
    const afk = firstUploadFileKey(aRaw);
    if (!vfk || !afk) return;

    if (out["video_bytes"] == null) {
        const vbuf = await readUploadFileByFileKey(vfk);
        out["video_bytes"] = vbuf.toString("base64");
        if (typeof out["video_filename"] !== "string" || !out["video_filename"]) {
            out["video_filename"] = path.basename(vfk);
        }
    }
    if (out["audio_bytes"] == null) {
        const abuf = await readUploadFileByFileKey(afk);
        out["audio_bytes"] = abuf.toString("base64");
        if (typeof out["audio_filename"] !== "string" || !out["audio_filename"]) {
            out["audio_filename"] = path.basename(afk);
        }
    }
}

/** concat_videos / concat_audios: `fileKeys[]` from local uploads */
async function embedFileKeysArrayForConcat(
    out: Record<string, unknown>,
    nodeSlot: string | undefined,
): Promise<void> {
    const raw = out["fileKeys"];
    if (!Array.isArray(raw) || raw.length === 0) return;

    const toVideos = nodeSlot === "concat-videos";
    const toAudios = nodeSlot === "concat_audios";
    if (!toVideos && !toAudios) return;

    if (toVideos && out["videos_bytes"] != null) return;
    if (toAudios && out["audios_bytes"] != null) return;

    const b64List: string[] = [];
    const names: string[] = [];
    for (const item of raw) {
        const fk = firstUploadFileKey(item);
        if (!fk) continue;
        const buf = await readUploadFileByFileKey(fk);
        b64List.push(buf.toString("base64"));
        names.push(path.basename(fk));
    }
    if (b64List.length === 0) return;

    if (toVideos) {
        out["videos_bytes"] = b64List;
        out["filenames"] = names;
    } else {
        out["audios_bytes"] = b64List;
        out["filenames"] = names;
    }
}

export type EmbedLocalUploadsForModalOptions = {
    /** Used to choose `videos_bytes` vs `audios_bytes` when expanding `fileKeys`. */
    nodeSlot?: string;
};

/**
 * Fills `*_base64` from local upload URLs / data URLs so Modal receives bytes inline.
 * Skips when the target base64 field is already non-empty.
 */
export async function embedLocalUploadsForModal(
    input: Record<string, unknown>,
    opts?: EmbedLocalUploadsForModalOptions,
): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { ...input };
    const nodeSlot = opts?.nodeSlot;

    for (const { urlKey, b64Key } of URL_FIELD_TO_B64) {
        const already = out[b64Key];
        if (typeof already === "string" && already.length > 0) continue;

        const raw = out[urlKey];
        if (typeof raw !== "string" || !raw.trim()) continue;

        const dataB64 = stripDataUrlToBase64(raw);
        if (dataB64) {
            out[b64Key] = dataB64;
            continue;
        }

        const fileKey = parseOpenflowUploadsFileKey(raw);
        if (!fileKey) continue;

        const buf = await readUploadFileByFileKey(fileKey);
        out[b64Key] = buf.toString("base64");
    }

    await embedFileKeysArrayForConcat(out, nodeSlot);
    await embedMergeKeysFromLocalUploads(out);
    await embedVideoBytesFromFileKeyFields(out);

    return out;
}
