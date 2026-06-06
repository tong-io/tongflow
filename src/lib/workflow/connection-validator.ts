/**
 * ABI↔ABI edge compatibility: coarse JSON Schema overlap checks between
 * a source slot's narrowed output payload and target slot input fields.
 */

import type { Connection, Node as FlowNode } from "@xyflow/react";
import type { JSONSchema7, JSONSchema7Definition } from "json-schema";

import { ABI_DEFINITIONS, ABI_NODES, type NodeSlot } from "@/generated/abi";
import { parseSourceHandleId } from "@/lib/abi/handle-introspect";
import { getAbiNodeRegistration } from "@/lib/abi/node-registry";
import { DATA_NODE_TYPES } from "@/lib/workflow/executable-workflow";
import { getEffectiveOutputType } from "@/lib/workflow/flow-connection-shared";

type AtomicResult = "compatible" | "disjoint" | "unknown";

const ABI_SLOT_SET = new Set<string>(Object.keys(ABI_NODES));

function isAbiNodeSlot(slot: string): slot is NodeSlot {
    return ABI_SLOT_SET.has(slot);
}

function resolveRefs(schema: JSONSchema7 | undefined, depth = 0): JSONSchema7 {
    if (depth > 48 || typeof schema !== "object" || schema === null) {
        return schema ?? {};
    }
    const s: JSONSchema7 = { ...schema };
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

function collectBranches(s: JSONSchema7): JSONSchema7[] {
    const list: JSONSchema7Definition[] | undefined = s.anyOf ?? s.oneOf;
    if (!list || list.length === 0) return [];
    const out: JSONSchema7[] = [];
    for (const b of list) {
        if (typeof b === "boolean") continue;
        out.push(resolveRefs(b));
    }
    return out;
}

function schemasAtomicCompare(
    producer: JSONSchema7,
    consumer: JSONSchema7,
    depth: number,
): AtomicResult {
    if (depth > 48) return "unknown";

    const prod = resolveRefs(producer);
    const cons = resolveRefs(consumer);

    const prodBranches = collectBranches(prod);
    if (prodBranches.length > 0) {
        // Producer may emit any of these branches; conservative aggregation:
        // every branch must agree before claiming compatible or disjoint.
        let allCompat = true;
        let allDisj = true;
        for (const branch of prodBranches) {
            const r = schemasAtomicCompare(branch, cons, depth + 1);
            if (r !== "compatible") allCompat = false;
            if (r !== "disjoint") allDisj = false;
        }
        if (allCompat) return "compatible";
        if (allDisj) return "disjoint";
        return "unknown";
    }

    const consBranches = collectBranches(cons);
    if (consBranches.length > 0) {
        // Consumer accepts any of these branches; the producer just needs to
        // match one. Disjoint only when it clashes with every branch.
        let anyCompat = false;
        let allDisj = true;
        for (const branch of consBranches) {
            const r = schemasAtomicCompare(prod, branch, depth + 1);
            if (r === "compatible") anyCompat = true;
            if (r !== "disjoint") allDisj = false;
        }
        if (anyCompat) return "compatible";
        if (allDisj) return "disjoint";
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

function getAbiOutputProperty(
    slot: NodeSlot,
    field: string,
): JSONSchema7 | undefined {
    const outputs = resolveRefs(ABI_NODES[slot].outputs as JSONSchema7);
    const props = outputs.properties as Record<string, JSONSchema7> | undefined;
    const raw = props?.[field];
    return raw ? resolveRefs(raw as JSONSchema7) : undefined;
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

/** Extract the consumer ABI input field name from an `in:<field>` target handle. */
function consumerFieldFromTargetHandle(
    targetHandle: string | null | undefined,
): string | undefined {
    if (typeof targetHandle !== "string") return undefined;
    if (!targetHandle.startsWith("in:")) return undefined;
    const field = targetHandle.slice("in:".length).trim();
    return field || undefined;
}

/**
 * When both ends are ABI nodes (by stored `feature` string matching `ABI_NODES`),
 * refine connection validity structurally between narrowed producer output payload
 * and mapped consumer input slots.
 *
 * Anything outside strict ABI↔ABI or inconclusive pairwise checks returns `undefined`,
 * leaving the decision to the coarser modality check in `connection-rules`.
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

    // Feature comes from the ABI registry (single source of truth), not node.data.
    const srcReg = getAbiNodeRegistration(sourceNode.id);
    const tgtReg = getAbiNodeRegistration(targetNode.id);
    const sourceSlot =
        srcReg && isAbiNodeSlot(srcReg.feature)
            ? (srcReg.feature as NodeSlot)
            : undefined;
    const targetSlot =
        tgtReg && isAbiNodeSlot(tgtReg.feature)
            ? (tgtReg.feature as NodeSlot)
            : undefined;
    if (!sourceSlot || !targetSlot) return undefined;

    const sourceOutEff = getEffectiveOutputType(
        sourceNode.id,
        srcRf,
        connection.sourceHandle,
    );
    if (!sourceOutEff) return undefined;

    // Consumer field comes directly from the AbiHandles-rendered targetHandle `in:<field>`.
    const consumerField = consumerFieldFromTargetHandle(
        connection.targetHandle,
    );
    if (!consumerField) return undefined;
    if (!(consumerField in getAbiInputProperties(targetSlot))) return undefined;

    // Source handle id (`out:<field>`) is the absolute address for the
    // producer ABI output property — no heuristic fallback needed.
    const producerField = parseSourceHandleId(connection.sourceHandle);
    if (!producerField) return undefined;
    const producerNarrow = getAbiOutputProperty(sourceSlot, producerField);
    if (!producerNarrow) return undefined;

    const consumerSch = consumerFieldSchema(targetSlot, consumerField);
    if (!consumerSch) return undefined;

    const result = schemasAtomicCompare(producerNarrow, consumerSch, 0);
    if (result === "compatible") return true;
    if (result === "disjoint") return false;
    return undefined;
}

export type AbiSchemaEdgeResult = AtomicResult;

/** Compare two JSON Schema fragments for producer→consumer edge safety (coarse). */
export function compareAbiProducerConsumerSchemas(
    producer: JSONSchema7,
    consumer: JSONSchema7,
): AbiSchemaEdgeResult {
    return schemasAtomicCompare(producer, consumer, 0);
}
