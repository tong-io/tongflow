/**
 * Runtime prompt construction for ABI-driven nodes.
 *
 * Combines:
 *  - ABI topology (from handle-introspect)
 *  - per-node sourceSpec overrides (from node-registry)
 *  - live ReactFlow graph state (nodes + edges)
 *  - the node's form/config state (from node.data)
 *
 * to produce: `Record<string, unknown>[]` (one prompt per batch element).
 */

import type { Edge, Node } from "@xyflow/react";

import type { NodeSlot } from "@/generated/abi";
import { getValueByPath } from "@/utils/path-utils";

import {
    type AbiTopology,
    type FieldClass,
    getAbiTopology,
    parseTargetHandleId,
    targetHandleId,
} from "./handle-introspect";
import { getAbiNodeRegistration } from "./node-registry";
import type { FieldSourceOverride, HandleOverride } from "./sources";

/* ------------------------------------------------------------------ */
/* Resolved spec (default-merged)                                      */
/* ------------------------------------------------------------------ */

export type ResolvedField =
    | {
          kind: "handle";
          nodeType: NonNullable<HandleOverride["nodeType"]>;
          path: NonNullable<HandleOverride["path"]>;
          batch?: boolean;
          collect?: boolean;
          required: boolean;
      }
    | { kind: "config"; required: boolean }
    | { kind: "static"; value: unknown; required: boolean }
    | { kind: "input"; inputName?: string; required: boolean };

export interface ResolvedSpec {
    topology: AbiTopology;
    fields: Record<string, ResolvedField>;
    /** Field that drives batch expansion (only one supported). */
    batchField?: string;
}

/**
 * ABI-derived primary output channel for a node. Picks the first non-expand
 * route as the "primary" output and infers `outputField` from its modality.
 */
export function deriveOutputType(spec: ResolvedSpec): {
    outputType?: string;
    outputField?: "fileKeys" | "texts";
} {
    const outs = spec.topology.outputs;
    if (outs.length === 0) return {};
    const primary = outs.find((o) => !o.expandEach) ?? outs[0];
    const outputField: "fileKeys" | "texts" =
        primary.nodeType === "textNode" ? "texts" : "fileKeys";
    return { outputType: primary.nodeType, outputField };
}

const PATH_DEFAULTS = {
    fileScalar: "fileKeys[0]",
    fileArray: "fileKeys",
    textScalar: "texts[0]",
    textArray: "texts",
} as const;

function defaultPath(cls: Extract<FieldClass, { kind: "handle" }>): string {
    if (cls.nodeType === "textNode") {
        return cls.array ? PATH_DEFAULTS.textArray : PATH_DEFAULTS.textScalar;
    }
    return cls.array ? PATH_DEFAULTS.fileArray : PATH_DEFAULTS.fileScalar;
}

export function resolveSpec(
    feature: NodeSlot,
    sourceSpec: Record<string, FieldSourceOverride> | undefined,
): ResolvedSpec {
    const topology = getAbiTopology(feature);
    const fields: Record<string, ResolvedField> = {};
    let batchField: string | undefined;

    for (const fieldName of topology.inputOrder) {
        const defaultCls = topology.inputs[fieldName];
        const override = sourceSpec?.[fieldName];

        if (!override) {
            // Default classification applies.
            if (defaultCls.kind === "handle") {
                fields[fieldName] = {
                    kind: "handle",
                    nodeType: defaultCls.nodeType,
                    path: defaultCls.path,
                    required: defaultCls.required,
                };
            } else {
                fields[fieldName] = {
                    kind: "config",
                    required: defaultCls.required,
                };
            }
            continue;
        }

        switch (override.kind) {
            case "handle": {
                const baseCls =
                    defaultCls.kind === "handle"
                        ? defaultCls
                        : ({
                              kind: "handle" as const,
                              nodeType: override.nodeType ?? "textNode",
                              path: override.path ?? PATH_DEFAULTS.textScalar,
                              array: !!override.batch || !!override.collect,
                              required: defaultCls.required,
                          } satisfies Extract<FieldClass, { kind: "handle" }>);
                const nodeType = override.nodeType ?? baseCls.nodeType;
                const path =
                    override.path ??
                    defaultPath({
                        ...baseCls,
                        nodeType,
                        array:
                            !!override.batch ||
                            !!override.collect ||
                            baseCls.array,
                    });
                fields[fieldName] = {
                    kind: "handle",
                    nodeType,
                    path,
                    batch: override.batch,
                    collect: override.collect,
                    required: defaultCls.required,
                };
                if (override.batch) batchField = fieldName;
                break;
            }
            case "config":
                fields[fieldName] = {
                    kind: "config",
                    required: defaultCls.required,
                };
                break;
            case "static":
                fields[fieldName] = {
                    kind: "static",
                    value: override.value,
                    required: defaultCls.required,
                };
                break;
            case "input":
                fields[fieldName] = {
                    kind: "input",
                    inputName: override.inputName,
                    required: defaultCls.required,
                };
                break;
        }
    }

    return { topology, fields, batchField };
}

/**
 * Target handle ids (`in:field`) for text-scalar handles that accept at most one
 * upstream edge (no batch/collect merge). Used for duplicate-edge prevention.
 */
export function singleEdgeTextScalarTargetHandles(
    feature: NodeSlot,
    sourceSpec: Record<string, FieldSourceOverride> | undefined,
): string[] {
    const spec = resolveSpec(feature, sourceSpec);
    const out: string[] = [];
    for (const [fieldName, f] of Object.entries(spec.fields)) {
        if (f.kind !== "handle") continue;
        if (f.nodeType !== "textNode") continue;
        if (f.path !== "texts[0]") continue;
        if (f.batch || f.collect) continue;
        out.push(targetHandleId(fieldName));
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Upstream collection (handle-driven)                                  */
/* ------------------------------------------------------------------ */

/**
 * For a given target node, walk its incoming edges and, for each ABI handle
 * field, pull the upstream value(s) from the source node's data using the
 * configured path. Returns map keyed by field name.
 */
export function collectHandleValues(
    targetNodeId: string,
    spec: ResolvedSpec,
    nodes: ReadonlyArray<Node> | Map<string, Node>,
    edges: ReadonlyArray<Edge>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    const lookup =
        nodes instanceof Map
            ? nodes
            : new Map(nodes.map((n) => [n.id, n] as const));

    for (const [field, resolved] of Object.entries(spec.fields)) {
        if (resolved.kind !== "handle") continue;

        if (resolved.batch || resolved.collect) {
            // Collect from every matching edge into a flat array.
            const values: unknown[] = [];
            for (const edge of edges) {
                if (edge.target !== targetNodeId) continue;
                if (parseTargetHandleId(edge.targetHandle) !== field) continue;
                const src = lookup.get(edge.source);
                if (!src) continue;
                const v = getValueByPath(
                    src.data as Record<string, unknown>,
                    resolved.path,
                );
                if (v === undefined || v === null) continue;
                if (Array.isArray(v)) values.push(...v);
                else values.push(v);
            }
            result[field] = values;
            continue;
        }

        // Single value: first edge matching this handle id.
        let value: unknown;
        for (const edge of edges) {
            if (edge.target !== targetNodeId) continue;
            if (parseTargetHandleId(edge.targetHandle) !== field) continue;
            const src = lookup.get(edge.source);
            if (!src) continue;
            value = getValueByPath(
                src.data as Record<string, unknown>,
                resolved.path,
            );
            if (value !== undefined && value !== null) break;
        }
        result[field] = value;
    }
    return result;
}

/* ------------------------------------------------------------------ */
/* Prompt assembly                                                      */
/* ------------------------------------------------------------------ */

export interface BuildPromptsArgs {
    spec: ResolvedSpec;
    /** Form/config field values (from node.data) keyed by ABI field. */
    configValues: Record<string, unknown>;
    /** Handle-derived values from `collectHandleValues`. */
    handleValues: Record<string, unknown>;
}

/**
 * Build one prompt per element in the batch field (if any), otherwise a
 * single prompt. Static / input overrides are inlined.
 *
 * Empty / null values are dropped (except required fields, which surface
 * as `undefined` and let ajv validation report them).
 */
export function buildPrompts({
    spec,
    configValues,
    handleValues,
}: BuildPromptsArgs): Record<string, unknown>[] {
    const fields = spec.fields;
    const fieldOrder = spec.topology.inputOrder;

    const baseAssemble = (
        overrides: Record<string, unknown>,
    ): Record<string, unknown> => {
        const prompt: Record<string, unknown> = {};
        for (const field of fieldOrder) {
            const f = fields[field];
            if (!f) continue;
            let v: unknown;
            if (field in overrides) {
                v = overrides[field];
            } else if (f.kind === "handle") {
                v = handleValues[field];
            } else if (f.kind === "config") {
                v = configValues[field];
            } else if (f.kind === "static") {
                v = f.value;
            } else if (f.kind === "input") {
                // input pass-through — at single-node canvas execution, we read
                // configValues as a stand-in (workflow exporter handles real
                // input wiring).
                v = configValues[field];
            }
            if (v === undefined || v === null || v === "") {
                if (!f.required) continue;
            }
            prompt[field] = v;
        }
        return prompt;
    };

    // No batching → single prompt.
    if (!spec.batchField) {
        return [baseAssemble({})];
    }

    const batchValue = handleValues[spec.batchField];
    const items: unknown[] = Array.isArray(batchValue) ? batchValue : [];
    if (items.length === 0) return [];
    return items.map((item) => baseAssemble({ [spec.batchField!]: item }));
}

/* ------------------------------------------------------------------ */
/* Convenience: resolve from registry by nodeId                         */
/* ------------------------------------------------------------------ */

export function resolveSpecForNode(nodeId: string): ResolvedSpec | undefined {
    const reg = getAbiNodeRegistration(nodeId);
    if (!reg) return undefined;
    return resolveSpec(reg.feature, reg.sourceSpec);
}
