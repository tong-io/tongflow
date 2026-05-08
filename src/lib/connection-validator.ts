/**
 * ABI↔ABI edge compatibility: coarse JSON Schema overlap checks between
 * a source slot's narrowed output payload and target slot input fields.
 */

import type { Connection, Node as FlowNode } from "@xyflow/react";
import type { JSONSchema7 } from "json-schema";

import { ABI_DEFINITIONS, ABI_NODES, type NodeSlot } from "@/generated/abi";
import { DATA_NODE_TYPES } from "@/utils/executable-workflow";
import {
    getEffectiveNodeConfig,
    getEffectiveOutputType,
    normalizeFlowTargetHandle,
} from "@/utils/flow-connection-shared";
import {
    getNodeExecutionConfig,
    type NodeExecutionConfig,
    type ParamSourceConfig,
} from "@/utils/node-execution-config";

type AtomicResult = "compatible" | "disjoint" | "unknown";

const ABI_SLOT_SET = new Set<string>(Object.keys(ABI_NODES));

function isAbiNodeSlot(slot: string): slot is NodeSlot {
    return ABI_SLOT_SET.has(slot);
}

function resolveRefs(schema: JSONSchema7 | undefined, depth = 0): JSONSchema7 {
    const s =
        typeof schema === "object" && schema !== null
            ? ({ ...schema } as JSONSchema7)
            : (schema as unknown as JSONSchema7);
    if (!s || depth > 48) return s ?? {};
    if (!s.$ref || typeof s.$ref !== "string") return s;
    const ref = s.$ref;
    if (!ref.startsWith("#/$defs/")) return s;
    const name = ref.slice("#/$defs/".length);
    const def =
        ABI_DEFINITIONS[name as keyof typeof ABI_DEFINITIONS] ??
        (ABI_DEFINITIONS as Record<string, JSONSchema7>)[name];
    if (!def) return s;
    const { $ref: _r, ...rest } = s;
    return resolveRefs({ ...(def as JSONSchema7), ...rest }, depth + 1);
}

function normalizeJsonTypes(schema: JSONSchema7 | undefined): string[] | null {
    if (!schema) return null;
    const t = schema.type;
    if (t === undefined) return [];
    return Array.isArray(t) ? (t as string[]) : [t as string];
}

function enumsCertainlyDisjoint(producer: JSONSchema7, consumer: JSONSchema7) {
    const ae = Array.isArray(producer.enum) ? producer.enum : undefined;
    const be = Array.isArray(consumer.enum) ? consumer.enum : undefined;
    if (!ae?.length || !be?.length) return false;
    const set = new Set(be.map(String));
    for (const v of ae) {
        if (set.has(String(v))) return false;
    }
    return true;
}

function flattenTypeTags(schema: JSONSchema7): Set<string> {
    const tags = normalizeJsonTypes(schema);
    const out = new Set<string>();
    if (!tags) return out;
    for (const t of tags) out.add(String(t));
    return out;
}

/** True when EVERY producer primitive tag clashes with EVERY consumer primitive tag-set. */
function rootTypeBundlesDisjoint(
    producer: JSONSchema7,
    consumer: JSONSchema7,
): boolean {
    const pTags = flattenTypeTags(producer);
    const qTags = flattenTypeTags(consumer);
    if (!pTags.size || !qTags.size) return false;

    for (const a of pTags) {
        let hasCompat = false;
        for (const b of qTags) {
            if (!primitiveTypesExplicitlyContradict(a, b)) {
                hasCompat = true;
                break;
            }
        }
        if (!hasCompat) return true;
    }
    return false;
}

/** JSON Schema `number`/`integer` are treated as overlapping families. */
function primitiveTypesExplicitlyContradict(
    prodTag: string,
    consumerTag: string,
): boolean {
    if (prodTag === consumerTag) return false;
    const nums = new Set(["number", "integer"]);
    if (nums.has(prodTag) && nums.has(consumerTag)) return false;

    const pairs: [string, string][] = [
        ["string", "object"],
        ["string", "integer"],
        ["string", "number"],
        ["string", "boolean"],
        ["object", "string"],
        ["object", "integer"],
        ["object", "number"],
        ["object", "boolean"],
        ["boolean", "integer"],
        ["boolean", "number"],
        ["integer", "boolean"],
        ["number", "boolean"],
        ["integer", "string"],
        ["number", "string"],
        ["boolean", "string"],
    ];
    return pairs.some(
        ([a, b]) =>
            (prodTag === a && consumerTag === b) ||
            (prodTag === b && consumerTag === a),
    );
}

function schemasAtomicCompare(
    producer: JSONSchema7,
    consumer: JSONSchema7,
    depth: number,
): AtomicResult {
    if (depth > 48) return "unknown";

    const prod = resolveRefs(producer);
    const cons = resolveRefs(consumer);

    if (
        (prod.anyOf && prod.anyOf.length > 0) ||
        (prod.oneOf && prod.oneOf.length > 0) ||
        (cons.anyOf && cons.anyOf.length > 0) ||
        (cons.oneOf && cons.oneOf.length > 0)
    ) {
        /**
         * TODO: OR-aggregate branches (e.g. Asset unions) so ABI edge checks can still return
         * compatible/disjoint when every branch agrees. Until then, tryAbiCompatibility falls back
         * to legacy upstreamType rules via `undefined`.
         */
        return "unknown";
    }

    if (
        prod.$ref &&
        (!prod.properties || Object.keys(prod.properties ?? {}).length === 0)
    ) {
        return "unknown";
    }
    if (
        cons.$ref &&
        (!cons.properties || Object.keys(cons.properties ?? {}).length === 0)
    ) {
        return "unknown";
    }

    if (enumsCertainlyDisjoint(prod, cons)) return "disjoint";

    if (rootTypeBundlesDisjoint(prod, cons)) return "disjoint";

    if (
        prod.type === "object" &&
        prod.properties &&
        Object.keys(prod.properties).length > 0
    ) {
        let inspected = false;
        for (const [key, pv] of Object.entries(prod.properties)) {
            const cv = cons.properties?.[key];
            if (!cv) continue;
            inspected = true;
            const branch = schemasAtomicCompare(
                pv as JSONSchema7,
                cv as JSONSchema7,
                depth + 1,
            );
            if (branch === "disjoint") return "disjoint";
        }
        /** Matched overlapping keys survived → conservative compatibility */
        if (inspected) return "compatible";
    }

    if (prod.type === "array" || cons.type === "array") return "unknown";

    const pTags = flattenTypeTags(prod);
    const qTags = flattenTypeTags(cons);
    if (!pTags.size || !qTags.size) return "unknown";

    return "compatible";
}

const DEFAULT_ABI_PRODUCER_TEXT_KEYS = [
    "text",
    "result",
    "texts",
    "content",
    "caption",
    "title",
] as const;
const DEFAULT_ABI_PRODUCER_FILE_KEYS = [
    "fileKeys",
    "files",
    "video",
    "image",
    "audio",
    "url",
    "urls",
    "r2_key",
] as const;

function pickProducerFieldSchema(
    outputs: JSONSchema7,
    outputField: "texts" | "fileKeys" | undefined,
    preferredKeys?: readonly string[] | undefined,
): JSONSchema7 | undefined {
    const base = resolveRefs(outputs as JSONSchema7);
    const props = (
        base as JSONSchema7 & {
            properties?: Record<string, JSONSchema7>;
        }
    ).properties;
    if (!props) return undefined;

    const chain: string[] = [];
    if (preferredKeys?.length) {
        for (const k of preferredKeys) {
            if (typeof k === "string" && k.length > 0) chain.push(k);
        }
    }
    if (outputField === "texts") {
        chain.push(...DEFAULT_ABI_PRODUCER_TEXT_KEYS);
    } else if (outputField === "fileKeys") {
        chain.push(...DEFAULT_ABI_PRODUCER_FILE_KEYS);
    }

    const seen = new Set<string>();
    for (const k of chain) {
        if (seen.has(k)) continue;
        seen.add(k);
        const p = props[k];
        if (p) return resolveRefs(p as JSONSchema7);
    }
    return undefined;
}

function getAbiInputProperties(slot: NodeSlot): Record<string, JSONSchema7> {
    const inputs = resolveRefs(ABI_NODES[slot].inputs as JSONSchema7);
    return ((inputs.properties as Record<string, JSONSchema7>) ?? {}) as Record<
        string,
        JSONSchema7
    >;
}

function consumerFieldSchema(
    targetSlot: NodeSlot,
    paramKey: string,
): JSONSchema7 | undefined {
    const props = getAbiInputProperties(targetSlot)[paramKey];
    return props ? resolveRefs(props as JSONSchema7) : undefined;
}

function upstreamSourceMatchesHandle(
    upstream: ParamSourceConfig,
    connectionTargetHandle: string | null | undefined,
): boolean {
    const actual = normalizeFlowTargetHandle(connectionTargetHandle);
    const declaredRaw = upstream.targetHandle;
    const declaredDefined =
        declaredRaw !== undefined && declaredRaw !== null && declaredRaw !== "";
    if (declaredDefined)
        return (
            normalizeFlowTargetHandle(declaredRaw as string | null) === actual
        );
    return actual === "a";
}

function collectCandidateParamKeys(
    cfg: NodeExecutionConfig | undefined,
    targetSlot: NodeSlot,
    connection: Pick<Connection, "targetHandle">,
    sourceOutType: string | undefined,
): string[] | undefined {
    if (!cfg?.paramMappings || !sourceOutType) return undefined;

    const inputPropSet = new Set(
        Object.keys(getAbiInputProperties(targetSlot)),
    );
    const out: string[] = [];

    outer: for (const [paramKey, mapping] of Object.entries(
        cfg.paramMappings,
    )) {
        if (!inputPropSet.has(paramKey)) continue;
        for (const src of mapping.sources ?? []) {
            if (src.type !== "upstream") continue;
            if (src.upstreamType !== sourceOutType) continue;
            if (!upstreamSourceMatchesHandle(src, connection.targetHandle))
                continue;
            out.push(paramKey);
            continue outer;
        }
    }

    if (out.length === 0) return undefined;

    return [...new Set(out)];
}

function aggregateAtomic(results: AtomicResult[]): boolean | undefined {
    if (results.some((r) => r === "compatible")) return true;
    if (results.every((r) => r === "disjoint")) return false;
    return undefined;
}

/**
 * When both ends are ABI nodes (by stored `feature` string matching `ABI_NODES`),
 * refine connection validity structurally between narrowed producer output payload
 * and mapped consumer input slots.
 *
 * Anything outside strict ABI↔ABI or inconclusive pairwise checks returns `undefined`
 * — legacy coarse rules still apply downstream.
 */
export function tryAbiCompatibility(
    connection: Connection,
    nodes: FlowNode[],
): boolean | undefined {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return undefined;

    const srcRf = sourceNode.type ?? "";
    const tgtRf = targetNode.type ?? "";
    if (srcRf in DATA_NODE_TYPES || tgtRf in DATA_NODE_TYPES) return undefined;

    const sourceData = (sourceNode.data ?? {}) as Record<string, unknown>;
    const targetData = (targetNode.data ?? {}) as Record<string, unknown>;

    const sf =
        typeof sourceData.feature === "string" ? sourceData.feature.trim() : "";
    const tf =
        typeof targetData.feature === "string" ? targetData.feature.trim() : "";

    const sourceSlot = sf && isAbiNodeSlot(sf) ? (sf as NodeSlot) : undefined;
    const targetSlot = tf && isAbiNodeSlot(tf) ? (tf as NodeSlot) : undefined;
    if (!sourceSlot || !targetSlot) return undefined;

    const sourceOutEff = getEffectiveOutputType(srcRf, sourceData);
    if (!sourceOutEff) return undefined;

    const targetCfg = getEffectiveNodeConfig(tgtRf, targetData);

    const paramKeys = collectCandidateParamKeys(
        targetCfg,
        targetSlot,
        connection,
        sourceOutEff,
    );
    if (!paramKeys || paramKeys.length === 0) return undefined;

    const sourceCfg =
        getNodeExecutionConfig(srcRf) ??
        getEffectiveNodeConfig(srcRf, sourceData);

    const producerNarrow = pickProducerFieldSchema(
        ABI_NODES[sourceSlot].outputs as JSONSchema7,
        sourceCfg?.outputField as "texts" | "fileKeys" | undefined,
        sourceCfg?.abiProducerPropertyCandidates,
    );
    if (!producerNarrow) return undefined;

    const atomics: AtomicResult[] = [];
    for (const pk of paramKeys) {
        const consumerSch = consumerFieldSchema(targetSlot, pk);
        if (!consumerSch) return undefined;

        atomics.push(schemasAtomicCompare(producerNarrow, consumerSch, 0));
    }

    return aggregateAtomic(atomics);
}

export type AbiSchemaEdgeResult = AtomicResult;

/** Compare two JSON Schema fragments for producer→consumer edge safety (coarse). */
export function compareAbiProducerConsumerSchemas(
    producer: JSONSchema7,
    consumer: JSONSchema7,
): AbiSchemaEdgeResult {
    return schemasAtomicCompare(producer, consumer, 0);
}

/** Resolve which `outputs.properties` entry represents the narrowed producer payload. */
export function narrowAbiProducerOutputField(
    outputs: JSONSchema7,
    outputField: "texts" | "fileKeys" | undefined,
    preferredKeys?: readonly string[] | undefined,
): JSONSchema7 | undefined {
    return pickProducerFieldSchema(outputs, outputField, preferredKeys);
}
