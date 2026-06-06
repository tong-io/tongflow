import "server-only";

import path from "node:path";
import type { JSONSchema7 } from "json-schema";

import { ABI_NODES, type NodeSlot } from "@/generated/abi";
import { readUploadFileByFileKey } from "@/lib/file/file-utils";
import { parseUploadFileKeyReference } from "@/lib/file/parse-upload-file-key";

/**
 * Schema-driven server resolver: walks the input schema for `$ref: Asset` (single or array)
 * fields and materializes any value still referencing a `file_key` / `/api/uploads/<key>` URL /
 * `data:...,<b64>` data URL into `{bytesBase64, mime, filename}`. Already-Asset values pass
 * through unchanged.
 *
 * The interactive path normally already produces Assets in the browser; this resolver exists
 * for the workflow runner path, where exported workflows reference upstream `file_key`s and
 * the server must materialize them before AJV validation.
 */

const ASSET_REF = "#/$defs/Asset";

type Asset = {
    bytesBase64: string;
    mime?: string;
    filename?: string;
};

function schemaIsAsset(schema: unknown): boolean {
    return (
        typeof schema === "object" &&
        schema !== null &&
        (schema as JSONSchema7).$ref === ASSET_REF
    );
}

function arrayItemsAreAsset(schema: JSONSchema7): boolean {
    if (schema.type !== "array") return false;
    const items = schema.items;
    return schemaIsAsset(items);
}

function isAlreadyAsset(value: unknown): value is Asset {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as Record<string, unknown>).bytesBase64 === "string" &&
        ((value as Record<string, unknown>).bytesBase64 as string).length > 0
    );
}

function stripDataUrlToAsset(s: string): Asset | null {
    const t = s.trim();
    if (!t.startsWith("data:") || !t.includes(",")) return null;
    const head = t.slice(5, t.indexOf(","));
    const rest = t.slice(t.indexOf(",") + 1);
    const mime = head.split(";")[0]?.trim() || undefined;
    return { bytesBase64: rest, mime };
}

async function resolveSingleAsset(
    value: unknown,
    fieldName: string,
): Promise<unknown> {
    if (value == null) return value;
    if (isAlreadyAsset(value)) return value;
    if (typeof value !== "string") return value;

    const dataAsset = stripDataUrlToAsset(value);
    if (dataAsset) return dataAsset;

    const fileKey = parseUploadFileKeyReference(value);
    if (!fileKey) {
        throw new Error(
            `[prepare-asset-input] field "${fieldName}" is a string but not an Asset, file_key, or data URL`,
        );
    }
    const buf = await readUploadFileByFileKey(fileKey);
    const filename = path.basename(fileKey);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeByExt: Record<string, string> = {
        wav: "audio/wav",
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        ogg: "audio/ogg",
        opus: "audio/opus",
        flac: "audio/flac",
        webm: "audio/webm",
    };
    return {
        bytesBase64: buf.toString("base64"),
        filename,
        ...(ext && mimeByExt[ext] ? { mime: mimeByExt[ext] } : {}),
    } satisfies Asset;
}

/**
 * For a single slot, resolve every `$ref: Asset` (single + array) field on the input.
 * Returns a new object; never mutates the caller's input.
 */
export async function prepareAssetInput<S extends NodeSlot>(
    slot: S,
    input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const root = ABI_NODES[slot].inputs as JSONSchema7;
    const props = root.properties;
    if (!props || typeof props !== "object") return input;

    const out: Record<string, unknown> = { ...input };

    for (const [key, subSchema] of Object.entries(props)) {
        if (!(key in out)) continue;
        const Sch = subSchema as JSONSchema7;

        if (schemaIsAsset(Sch)) {
            out[key] = await resolveSingleAsset(out[key], key);
            continue;
        }

        if (arrayItemsAreAsset(Sch)) {
            const arr = out[key];
            if (!Array.isArray(arr)) continue;
            out[key] = await Promise.all(
                arr.map((item, i) => resolveSingleAsset(item, `${key}[${i}]`)),
            );
        }
    }

    return out;
}
