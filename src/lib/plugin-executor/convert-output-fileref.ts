import type { JSONSchema7 } from "json-schema";

import { ABI_NODES, type NodeSlot } from "@/generated/abi";
import { saveFile } from "@/lib/file/file-utils";

const FILE_REF_REFS = new Set([
    "#/$defs/FileRef",
    "#/$defs/ImageRef",
    "#/$defs/VideoRef",
    "#/$defs/AudioRef",
]);

function schemaIsFileRef(schema: unknown): boolean {
    if (typeof schema !== "object" || schema === null) return false;
    const ref = (schema as JSONSchema7).$ref;
    return typeof ref === "string" && FILE_REF_REFS.has(ref);
}

function mimeToExt(mime: string): string | null {
    const m = mime.split(";")[0]?.trim().toLowerCase() ?? "";
    const map: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "video/mp4": "mp4",
        "audio/wav": "wav",
        "audio/mpeg": "mp3",
        "audio/x-wav": "wav",
        "audio/flac": "flac",
        "application/octet-stream": "bin",
    };
    return map[m] ?? null;
}

function extFromFilename(name: string): string | null {
    const i = name.lastIndexOf(".");
    if (i <= 0 || i === name.length - 1) return null;
    return name.slice(i + 1).replace(/^\./, "") || null;
}

/**
 * Walk slot output schema for `$ref: FileRef` fields only.
 * Plugin returns ABI {@link Asset} (`bytesBase64`); already-persisted `{ file_key }` passes through.
 */
export async function convertAssetOutputsToFileRefs(
    slot: NodeSlot,
    raw: unknown,
    taskId: string,
): Promise<unknown> {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return raw;
    }

    const out = { ...(raw as Record<string, unknown>) };
    if (out.success === false) return out;

    const root = ABI_NODES[slot].outputs as JSONSchema7;
    const props = root.properties;
    if (!props || typeof props !== "object") return out;

    for (const [key, subSchema] of Object.entries(props)) {
        if (!(key in out)) continue;
        const Sch = subSchema as JSONSchema7;

        if (schemaIsFileRef(Sch)) {
            out[key] = await normalizeFileRefValue(out[key], taskId);
            continue;
        }

        if (
            Sch.type === "array" &&
            Sch.items &&
            schemaIsFileRef(Sch.items) &&
            Array.isArray(out[key])
        ) {
            const arr = out[key] as unknown[];
            out[key] = await Promise.all(
                arr.map((item) => normalizeFileRefValue(item, taskId)),
            );
        }
    }

    return out;
}

async function normalizeFileRefValue(
    val: unknown,
    taskId: string,
): Promise<unknown> {
    if (val == null) return val;

    if (typeof val === "object" && !Array.isArray(val)) {
        const rec = val as Record<string, unknown>;
        if (typeof rec.file_key === "string" && rec.file_key.trim()) {
            const next: Record<string, unknown> = {
                file_key: rec.file_key.trim(),
            };
            if (typeof rec.mime === "string") next.mime = rec.mime;
            if (typeof rec.filename === "string") next.filename = rec.filename;
            return next;
        }

        const b64 = rec.bytesBase64;
        if (typeof b64 === "string" && b64.length > 0) {
            const buf = Buffer.from(b64, "base64");
            if (buf.length === 0) {
                throw new Error(
                    "Plugin returned empty binary payload for a FileRef field (decoded length 0)",
                );
            }
            const mime = typeof rec.mime === "string" ? rec.mime : "";
            const ext =
                mimeToExt(mime) ??
                (typeof rec.filename === "string"
                    ? extFromFilename(rec.filename)
                    : null) ??
                "bin";
            const file_key = await saveFile(
                buf,
                ext.replace(/^\./, ""),
                taskId,
            );
            const next: Record<string, unknown> = { file_key };
            if (typeof rec.mime === "string") next.mime = rec.mime;
            if (typeof rec.filename === "string") next.filename = rec.filename;
            return next;
        }
    }

    return val;
}
