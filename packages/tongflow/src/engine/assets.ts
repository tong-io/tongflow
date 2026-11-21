/**
 * Asset materialization, a port of `sdk/tongflow/engine/assets.py`.
 *
 * - {@link materializeAssetInputs}: every `$ref: Asset` input (single or
 *   array) holding a reference string becomes `{bytesBase64, filename, mime?}`.
 *   References resolve, in Python's order, as: an Asset already → kept; a
 *   `data:` URL → split; a key the {@link AssetStore} knows → its bytes; an
 *   `http(s)` URL → fetched. There is no filesystem search in the browser:
 *   the store stands in for Python's search directories.
 * - {@link convertAssetOutputsToFileRefs}: every `FileRef` / `ImageRef` /
 *   `VideoRef` / `AudioRef` output (single or array) carrying `bytesBase64`
 *   is put into the store and replaced by `{file_key, mime?, filename?}`.
 *   `ModelRef` is left untouched, as in Python.
 *
 * The ABI is followed literally (ADR 0001): assets are `bytesBase64`, there
 * is no Blob form.
 */

import {
    arrayItemsAreAsset,
    arrayItemsAreFileRef,
    schemaIsAsset,
    schemaIsFileRef,
    slotProperties,
} from "./abi-schema";
import { base64ToBytes, bytesToBase64 } from "./base64";
import type {
    AbiSlotSchemas,
    AssetPayload,
    AssetStore,
    FileRefPayload,
} from "./types";

const MIME_BY_EXT: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    opus: "audio/opus",
    flac: "audio/flac",
    pdf: "application/pdf",
    txt: "text/plain",
};

const EXT_BY_MIME: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
    "application/octet-stream": "bin",
};

const UPLOAD_URL_PREFIX = "/api/uploads/";

type Fetch = (url: string) => Promise<Response>;
type Abi = Readonly<Record<string, AbiSlotSchemas>>;

/** `pathlib.PurePosixPath(p).name`. */
export function baseName(p: string): string {
    const trimmed = p.replace(/\/+$/, "");
    return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/** `pathlib.PurePath(name).suffix` without the dot ("" when there is none). */
function suffixOf(name: string): string {
    const i = name.lastIndexOf(".");
    if (i <= 0 || i === name.length - 1) return "";
    return name.slice(i + 1);
}

export function mimeFromExt(name: string): string | undefined {
    return MIME_BY_EXT[suffixOf(name).toLowerCase()];
}

function extFromMime(mime: string): string | undefined {
    return EXT_BY_MIME[mime.split(";")[0].trim().toLowerCase()];
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAlreadyAsset(v: unknown): v is AssetPayload {
    return (
        isRecord(v) &&
        typeof v.bytesBase64 === "string" &&
        v.bytesBase64.length > 0
    );
}

function stripDataUrl(s: string): AssetPayload | null {
    const t = s.trim();
    const comma = t.indexOf(",");
    if (!t.startsWith("data:") || comma === -1) return null;
    const mime = t.slice(5, comma).split(";")[0].trim();
    const out: AssetPayload = { bytesBase64: t.slice(comma + 1) };
    if (mime) out.mime = mime;
    return out;
}

async function readReferenceBytes(
    ref: string,
    store: AssetStore,
    fetchUrl: Fetch | undefined,
): Promise<Uint8Array> {
    const owned = await store.get(ref);
    if (owned) return owned;
    if (ref.startsWith("http://") || ref.startsWith("https://")) {
        const doFetch = fetchUrl ?? globalThis.fetch;
        const res = await doFetch(ref);
        if (!res.ok) {
            throw new Error(`HTTP Error ${res.status} fetching '${ref}'`);
        }
        return new Uint8Array(await res.arrayBuffer());
    }
    // Upload URLs the canvas hands out resolve to the bare key.
    if (ref.startsWith(UPLOAD_URL_PREFIX)) {
        const bare = await store.get(ref.slice(UPLOAD_URL_PREFIX.length));
        if (bare) return bare;
    }
    throw new Error(
        `Could not resolve asset reference '${ref}' (not in the asset store)`,
    );
}

async function resolveSingleAsset(
    value: unknown,
    store: AssetStore,
    fetchUrl: Fetch | undefined,
): Promise<unknown> {
    if (value == null) return value;
    if (isAlreadyAsset(value)) return value;
    if (typeof value !== "string") return value;

    const dataAsset = stripDataUrl(value);
    if (dataAsset) return dataAsset;

    const bytes = await readReferenceBytes(value, store, fetchUrl);
    const filename = baseName(value.split("?")[0]);
    const out: AssetPayload = {
        bytesBase64: bytesToBase64(bytes),
        filename,
    };
    const mime = mimeFromExt(filename);
    if (mime) out.mime = mime;
    return out;
}

/** Resolve every `$ref: Asset` input of `slot` to `{bytesBase64, filename, mime?}`. */
export async function materializeAssetInputs(
    slot: string,
    inputs: Record<string, unknown>,
    abi: Abi,
    store: AssetStore,
    fetchUrl?: Fetch,
): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { ...inputs };
    const props = slotProperties(abi, slot, "inputs");
    if (!props) return out;
    for (const [key, sub] of Object.entries(props)) {
        if (!(key in out)) continue;
        if (schemaIsAsset(sub)) {
            out[key] = await resolveSingleAsset(out[key], store, fetchUrl);
        } else if (arrayItemsAreAsset(sub)) {
            const arr = out[key];
            if (Array.isArray(arr)) {
                const resolved: unknown[] = [];
                for (const item of arr) {
                    resolved.push(
                        await resolveSingleAsset(item, store, fetchUrl),
                    );
                }
                out[key] = resolved;
            }
        }
    }
    return out;
}

async function normalizeFileRef(
    value: unknown,
    store: AssetStore,
): Promise<unknown> {
    if (!isRecord(value)) return value;

    const fileKey = value.file_key;
    if (typeof fileKey === "string" && fileKey.trim()) {
        const ref: FileRefPayload = { file_key: fileKey.trim() };
        if (typeof value.mime === "string") ref.mime = value.mime;
        if (typeof value.filename === "string") ref.filename = value.filename;
        return ref;
    }

    const b64 = value.bytesBase64;
    if (typeof b64 === "string" && b64) {
        const bytes = base64ToBytes(b64);
        if (bytes.length === 0) {
            throw new Error(
                "Plugin returned empty binary payload for a FileRef field (decoded length 0)",
            );
        }
        const mime = typeof value.mime === "string" ? value.mime : undefined;
        const filename =
            typeof value.filename === "string" ? value.filename : undefined;
        const ext =
            extFromMime(mime ?? "") ||
            (filename ? suffixOf(filename).toLowerCase() : "") ||
            "bin";
        return store.put(bytes, { mime, filename, ext });
    }
    return value;
}

/** Store every `bytesBase64` a plugin returned in a FileRef-family output field. */
export async function convertAssetOutputsToFileRefs(
    slot: string,
    raw: unknown,
    abi: Abi,
    store: AssetStore,
): Promise<unknown> {
    if (!isRecord(raw)) return raw;
    const out: Record<string, unknown> = { ...raw };
    if (out.success === false) return out;
    const props = slotProperties(abi, slot, "outputs");
    if (!props) return out;
    for (const [key, sub] of Object.entries(props)) {
        if (!(key in out)) continue;
        if (schemaIsFileRef(sub)) {
            out[key] = await normalizeFileRef(out[key], store);
        } else if (arrayItemsAreFileRef(sub) && Array.isArray(out[key])) {
            const resolved: unknown[] = [];
            for (const item of out[key] as unknown[]) {
                resolved.push(await normalizeFileRef(item, store));
            }
            out[key] = resolved;
        }
    }
    return out;
}

/**
 * Replace every ref to a store-issued handle with its bytes: `{file_key}` →
 * `{bytesBase64, mime?, filename?}`, a bare key string → its base64. The
 * counterpart of Python's inline mode (`_inline_outputs_in_obj`), for hosts
 * that want self-contained results.
 */
export async function inlineAssets<T>(value: T, store: AssetStore): Promise<T> {
    const walk = async (v: unknown): Promise<unknown> => {
        if (Array.isArray(v)) {
            const out: unknown[] = [];
            for (const item of v) out.push(await walk(item));
            return out;
        }
        if (isRecord(v)) {
            const fk = v.file_key;
            if (typeof fk === "string" && store.owns(fk)) {
                const bytes = await store.get(fk);
                if (bytes) {
                    const asset: AssetPayload = {
                        bytesBase64: bytesToBase64(bytes),
                    };
                    if (typeof v.mime === "string") asset.mime = v.mime;
                    if (typeof v.filename === "string") {
                        asset.filename = v.filename;
                    }
                    return asset;
                }
            }
            const out: Record<string, unknown> = {};
            for (const [k, item] of Object.entries(v))
                out[k] = await walk(item);
            return out;
        }
        if (typeof v === "string" && store.owns(v)) {
            const bytes = await store.get(v);
            if (bytes) return bytesToBase64(bytes);
        }
        return v;
    };
    return (await walk(value)) as T;
}
