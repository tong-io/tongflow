/**
 * ABI schema predicates, a port of `sdk/tongflow/engine/abi_schema.py`.
 *
 * The engine walks a slot's input / output JSON Schema to find the fields it
 * must materialize (`$ref: Asset`) or store (`FileRef` / `ImageRef` /
 * `VideoRef` / `AudioRef`). `ModelRef` is deliberately not in that set: the
 * Python engine leaves a model output as the plugin returned it, and so does
 * this one.
 */

import type { AbiSlotSchemas } from "./types";

export const ASSET_REF = "#/$defs/Asset";

/** Output `$ref`s whose `bytesBase64` the engine stores and replaces by `{file_key}`. */
export const FILE_REF_REFS: ReadonlySet<string> = new Set([
    "#/$defs/FileRef",
    "#/$defs/ImageRef",
    "#/$defs/VideoRef",
    "#/$defs/AudioRef",
]);

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function schemaIsAsset(schema: unknown): boolean {
    return isObject(schema) && schema.$ref === ASSET_REF;
}

export function schemaIsFileRef(schema: unknown): boolean {
    return (
        isObject(schema) &&
        typeof schema.$ref === "string" &&
        FILE_REF_REFS.has(schema.$ref)
    );
}

export function arrayItemsAreAsset(schema: unknown): boolean {
    return (
        isObject(schema) &&
        schema.type === "array" &&
        schemaIsAsset(schema.items)
    );
}

export function arrayItemsAreFileRef(schema: unknown): boolean {
    return (
        isObject(schema) &&
        schema.type === "array" &&
        schemaIsFileRef(schema.items)
    );
}

/** `properties` of a slot's input or output schema, or `null` when it has none. */
export function slotProperties(
    abi: Readonly<Record<string, AbiSlotSchemas>>,
    slot: string,
    direction: "inputs" | "outputs",
): JsonObject | null {
    const schema = abi[slot]?.[direction];
    if (!isObject(schema)) return null;
    return isObject(schema.properties) ? schema.properties : null;
}
