/**
 * ABI introspection: classify a feature's input/output fields into handle topology
 * (target handles for upstream-fed fields, config fields for form-driven ones) and
 * derive the source / target Handle ids that <AbiHandles> renders.
 *
 * This module is the single source of truth for "which ABI input is a handle vs a config",
 * consumed by useAbiForm, useAbiExecution, AbiHandles, workflow-exporter, and connection-validator.
 */

import type { JSONSchema7 } from "json-schema";
import { ABI_DEFINITIONS, ABI_NODES, type NodeSlot } from "@/generated/abi";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type DataNodeType =
    | "imageNode"
    | "audioNode"
    | "videoNode"
    | "textNode"
    | "fileNode"
    | "modelNode";

export type RefName =
    | "Asset"
    | "FileRef"
    | "ImageRef"
    | "AudioRef"
    | "VideoRef"
    | "ModelRef";

/** Source classification per ABI input field. */
export type FieldClass =
    | {
          kind: "handle";
          /** Suggested upstream node type (best-effort). */
          nodeType: DataNodeType;
          /**
           * Default extraction path on the upstream node's data:
           * - "fileKeys[0]" for single ref,
           * - "fileKeys" for array of refs (multi),
           * - "texts[0]" for text scalar from textNode,
           * - "texts" for array of texts.
           */
          path: string;
          /** Array-typed handle (consumer wants multiple). */
          array: boolean;
          /** Whether this field is required by ABI. */
          required: boolean;
      }
    | {
          kind: "config";
          /** Field is required by ABI. */
          required: boolean;
          /** Underlying JSON Schema for this field (post-ref-resolution). */
          schema: JSONSchema7;
      };

export interface AbiTopology {
    feature: NodeSlot;
    /** Each input field's default classification (before sourceSpec overrides). */
    inputs: Record<string, FieldClass>;
    /** Ordered list of input field names (preserves schema order). */
    inputOrder: string[];
    /** Required input field names. */
    requiredInputs: string[];
    /** Output handles to render on the source side. */
    outputs: OutputHandle[];
}

export interface OutputHandle {
    field: string;
    nodeType: DataNodeType;
    /** True for `x-expand-each` array outputs. */
    expandEach: boolean;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const REF_TO_NODE_TYPE: Record<RefName, DataNodeType> = {
    Asset: "imageNode", // Asset is generic bytes; default to image (rare in inputs)
    FileRef: "fileNode",
    ImageRef: "imageNode",
    AudioRef: "audioNode",
    VideoRef: "videoNode",
    ModelRef: "modelNode",
};

/** Reserved output fields that are protocol-level, not data routes. */
const OUTPUT_META_FIELDS = new Set(["success", "error", "thinking"]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function resolveRef(refStr: string): JSONSchema7 | undefined {
    if (!refStr.startsWith("#/$defs/")) return undefined;
    const name = refStr.slice("#/$defs/".length);
    return ABI_DEFINITIONS[name] as JSONSchema7 | undefined;
}

function refName(refStr: string | undefined): RefName | undefined {
    if (!refStr || !refStr.startsWith("#/$defs/")) return undefined;
    const name = refStr.slice("#/$defs/".length) as RefName;
    return name in REF_TO_NODE_TYPE ? name : undefined;
}

function flattenSchema(schema: JSONSchema7): JSONSchema7 {
    if (typeof schema?.$ref === "string") {
        const resolved = resolveRef(schema.$ref);
        if (resolved) {
            const { $ref: _r, ...rest } = schema;
            return { ...resolved, ...rest } as JSONSchema7;
        }
    }
    return schema;
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/**
 * For `Asset` ($ref) inputs the schema itself doesn't carry the media kind,
 * so fall back to the field name. Order matters (`audio` first to win over
 * a `xxx_audio` field, etc.).
 */
function inferNodeTypeFromFieldName(field: string): DataNodeType {
    const lower = field.toLowerCase();
    if (
        /(^|_|-)audio($|_|-|key)/.test(lower) ||
        lower.includes("audio") ||
        lower.includes("speech") ||
        lower.includes("voice")
    )
        return "audioNode";
    if (/(^|_|-)video($|_|-|key)/.test(lower) || lower.includes("video"))
        return "videoNode";
    if (/(^|_|-)image($|_|-|key)/.test(lower) || lower.includes("image"))
        return "imageNode";
    return "imageNode"; // generic Asset fallback
}

function classifyInputField(
    field: string,
    schema: JSONSchema7,
    required: boolean,
): FieldClass {
    const ref = typeof schema?.$ref === "string" ? schema.$ref : undefined;
    const refKind = refName(ref);

    // 1) $ref directly to a *Ref / Asset → single handle
    if (refKind) {
        const nodeType =
            refKind === "Asset"
                ? inferNodeTypeFromFieldName(field)
                : REF_TO_NODE_TYPE[refKind];
        return {
            kind: "handle",
            nodeType,
            path: "fileKeys[0]",
            array: false,
            required,
        };
    }

    // 2) Array of $ref or array of string with appropriate naming → handle
    if (schema?.type === "array") {
        const items = schema.items as JSONSchema7 | undefined;
        if (items) {
            const itemRef =
                typeof items.$ref === "string" ? items.$ref : undefined;
            const itemRefKind = refName(itemRef);
            if (itemRefKind) {
                const nodeType =
                    itemRefKind === "Asset"
                        ? inferNodeTypeFromFieldName(field)
                        : REF_TO_NODE_TYPE[itemRefKind];
                return {
                    kind: "handle",
                    nodeType,
                    path: "fileKeys",
                    array: true,
                    required,
                };
            }
            // array of strings, named like "texts" → default to textNode handle
            if (
                items.type === "string" &&
                (field === "texts" || field === "text")
            ) {
                return {
                    kind: "handle",
                    nodeType: "textNode",
                    path: "texts",
                    array: true,
                    required,
                };
            }
        }
        // Other arrays → config (user fills in)
        return { kind: "config", required, schema };
    }

    // 3) Bare scalar — default to config; sourceSpec can override to handle.
    return { kind: "config", required, schema };
}

/* ------------------------------------------------------------------ */
/* Output routing                                                      */
/* ------------------------------------------------------------------ */

function classifyOutputs(outputs: JSONSchema7): OutputHandle[] {
    const props = outputs?.properties as
        | Record<string, JSONSchema7>
        | undefined;
    if (!props) return [];

    const out: OutputHandle[] = [];
    for (const [field, schema] of Object.entries(props)) {
        if (OUTPUT_META_FIELDS.has(field)) continue;

        const flat = flattenSchema(schema);

        // direct $ref to *Ref
        const directRef = refName(schema?.$ref);
        if (directRef) {
            out.push({
                field,
                nodeType: REF_TO_NODE_TYPE[directRef],
                expandEach: false,
            });
            continue;
        }

        if (flat?.type === "array") {
            const items = flat.items as JSONSchema7 | undefined;
            if (!items) continue;
            const itemRef = refName(items.$ref);
            const expandEach =
                (schema as Record<string, unknown>)["x-expand-each"] === true;
            if (itemRef) {
                out.push({
                    field,
                    nodeType: REF_TO_NODE_TYPE[itemRef],
                    expandEach,
                });
                continue;
            }
            // array of arrays
            if (items.type === "array") {
                const innerItems = items.items as JSONSchema7 | undefined;
                const innerRef = refName(innerItems?.$ref);
                if (innerRef) {
                    out.push({
                        field,
                        nodeType: REF_TO_NODE_TYPE[innerRef],
                        expandEach: true,
                    });
                }
                continue;
            }
            if (items.type === "string") {
                out.push({ field, nodeType: "textNode", expandEach });
            }
            continue;
        }

        // Bare string output → textNode handle. Stays aligned with
        // `resolveAbiOutputMappings` in schema/tongflow-abi.ts.
        if (flat?.type === "string") {
            out.push({ field, nodeType: "textNode", expandEach: false });
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const TOPOLOGY_CACHE = new Map<NodeSlot, AbiTopology>();

export function getAbiTopology(feature: NodeSlot): AbiTopology {
    const cached = TOPOLOGY_CACHE.get(feature);
    if (cached) return cached;

    const node = ABI_NODES[feature];
    if (!node) {
        throw new Error(`[abi/handle-introspect] Unknown feature: ${feature}`);
    }

    const inputs = node.inputs as JSONSchema7;
    const required = new Set<string>(
        Array.isArray(inputs?.required) ? (inputs.required as string[]) : [],
    );
    const props = (inputs?.properties ?? {}) as Record<string, JSONSchema7>;

    const inputOrder: string[] = [];
    const inputMap: Record<string, FieldClass> = {};
    for (const [field, schema] of Object.entries(props)) {
        inputOrder.push(field);
        inputMap[field] = classifyInputField(
            field,
            schema,
            required.has(field),
        );
    }

    const outputs = classifyOutputs(node.outputs as JSONSchema7);

    const topology: AbiTopology = {
        feature,
        inputs: inputMap,
        inputOrder,
        requiredInputs: [...required].filter((f) => f in inputMap),
        outputs,
    };
    TOPOLOGY_CACHE.set(feature, topology);
    return topology;
}

/** Build the canonical target Handle id for an ABI input field. */
export function targetHandleId(field: string): string {
    return `in:${field}`;
}

/** Build the canonical source Handle id for an ABI output field. */
export function sourceHandleId(field: string): string {
    return `out:${field}`;
}

/** Parse a Handle id like "in:foo" → "foo". Returns undefined for non-conforming ids. */
export function parseTargetHandleId(
    handle: string | null | undefined,
): string | undefined {
    if (!handle || !handle.startsWith("in:")) return undefined;
    return handle.slice(3);
}

export function parseSourceHandleId(
    handle: string | null | undefined,
): string | undefined {
    if (!handle || !handle.startsWith("out:")) return undefined;
    return handle.slice(4);
}
