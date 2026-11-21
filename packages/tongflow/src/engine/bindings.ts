/**
 * Resolve a node's ABI input params from its bindings table, a port of
 * `sdk/tongflow/engine/bindings.py`.
 *
 * Values are read, in order, from: the upstream executable's projected output
 * view, the live data-node state (`texts` / `fileKeys`), then the workflow
 * inputs (for data nodes flagged as inputs).
 *
 * Batch fan-out: when the node's `batchField` collects N upstream values,
 * {@link resolveNodeParamSets} returns N param sets — one per value, every
 * other field broadcast. Any other scalar-shaped input that collects more than
 * one value is an error: one-click execution never silently drops items an
 * upstream split produced.
 */

import type {
    DataNode,
    ExecutableNode,
} from "../core/workflow/executable-workflow";
import type { AbiOutputView } from "./output-view";
import type { WorkflowInputValue } from "./types";

/** Live `texts` / `fileKeys` of each data node during a run. */
export type DataNodeState = Record<
    string,
    { texts?: string[]; fileKeys?: string[] }
>;

export function resolveNodeParamSets(
    node: ExecutableNode,
    outputViews: Record<string, AbiOutputView>,
    dataNodeState: DataNodeState,
    dataNodes: readonly DataNode[],
    inputs: Record<string, WorkflowInputValue | undefined>,
): Record<string, unknown>[] {
    const params: Record<string, unknown> = {};
    const bindings = node.bindings;
    if (!bindings || Object.keys(bindings).length === 0) return [params];

    const batchField = node.batchField;
    let batchValues: string[] | null = null;
    const dataNodeMap = new Map(dataNodes.map((d) => [d.id, d]));

    const readSource = (fromNodeId: string, fromField: string): string[] => {
        // 1) Upstream executable: read the projected view.
        const view = outputViews[fromNodeId];
        if (view !== undefined) {
            const channel = view[fromField];
            return channel ? [...channel.values] : [];
        }
        // 2) Upstream data node: read live state (texts / fileKeys).
        const slot = dataNodeState[fromNodeId];
        if (slot !== undefined) {
            if (fromField === "texts" && slot.texts?.length) {
                return [...slot.texts];
            }
            if (fromField === "fileKeys" && slot.fileKeys?.length) {
                return [...slot.fileKeys];
            }
        }
        // 3) Workflow input fallback (data node with inputName).
        const dn = dataNodeMap.get(fromNodeId);
        if (dn?.inputName) {
            const supplied = inputs[dn.inputName];
            if (Array.isArray(supplied)) return supplied.map(String);
            if (typeof supplied === "string") return [supplied];
            if (supplied && typeof supplied === "object") {
                const arr = (supplied as Record<string, unknown>)[fromField];
                if (Array.isArray(arr)) return arr.map(String);
            }
        }
        return [];
    };

    for (const [field, binding] of Object.entries(bindings)) {
        if (binding.kind === "handle") {
            const collected: string[] = [];
            for (const s of binding.sources ?? []) {
                collected.push(...readSource(s.fromNodeId, s.fromField));
            }
            if (binding.consumerShape === "scalar") {
                if (collected.length > 1) {
                    if (field === batchField) {
                        batchValues = collected;
                    } else {
                        const label =
                            node.label || node.feature || node.id || "?";
                        throw new Error(
                            `Node '${label}' input '${field}' expects a single ` +
                                `value but received ${collected.length} upstream ` +
                                "values. Refusing to silently drop all but the " +
                                "first — reduce the upstream to one value.",
                        );
                    }
                } else if (collected.length) {
                    params[field] = collected[0];
                }
            } else {
                params[field] = collected;
            }
        } else if (binding.kind === "config" || binding.kind === "static") {
            params[field] = binding.value;
        } else if (binding.kind === "input") {
            params[field] = inputs[binding.inputName];
        }
    }

    if (batchValues === null || batchField === undefined) return [params];
    const field = batchField;
    return batchValues.map((v) => ({ ...params, [field]: v }));
}
