/**
 * Project a plugin's output into its ABI output view, a port of
 * `sdk/tongflow/engine/output_view.py`. The canvas re-exports it
 * (`tongflow/canvas`) so edit mode and execution mode project identically.
 *
 * Each channel's `values` is a flat `string[]`: asset `$ref` objects yield
 * their `itemValuePath` (typically `file_key`), scalars are wrapped into a
 * one-element list, arrays are flattened (an array of arrays loses its
 * grouping here; the canvas regroups it in `applyResolvedOutputRoutes`).
 */

import type { ResolvedOutputRoute } from "../core/schema/tongflow-abi";

export interface AbiOutputChannel {
    sourceField: string;
    nodeType: ResolvedOutputRoute["nodeType"];
    dataField: ResolvedOutputRoute["dataField"];
    expandEach: boolean;
    values: string[];
}
export type AbiOutputView = Record<string, AbiOutputChannel>;

function extractItemValue(
    item: unknown,
    itemValuePath: string | undefined,
): string | undefined {
    if (item == null) return undefined;
    if (itemValuePath && typeof item === "object") {
        const v = (item as Record<string, unknown>)[itemValuePath];
        if (v == null) return undefined;
        const s = String(v);
        return s && s !== "undefined" ? s : undefined;
    }
    if (typeof item === "string") return item || undefined;
    const s = String(item);
    return s && s !== "undefined" ? s : undefined;
}

export function computeOutputView(
    routes: readonly ResolvedOutputRoute[],
    payload: Record<string, unknown> | undefined,
): AbiOutputView {
    const view: AbiOutputView = {};
    if (!payload) return view;
    for (const route of routes) {
        if (typeof route.sourceField !== "string") continue;
        const raw = payload[route.sourceField];
        if (raw == null) continue;
        const values: string[] = [];
        if (Array.isArray(raw)) {
            if (route.isArrayOfArrays) {
                for (const inner of raw as unknown[]) {
                    if (!Array.isArray(inner)) continue;
                    for (const item of inner as unknown[]) {
                        const v = extractItemValue(item, route.itemValuePath);
                        if (v) values.push(v);
                    }
                }
            } else {
                for (const item of raw as unknown[]) {
                    const v = extractItemValue(item, route.itemValuePath);
                    if (v) values.push(v);
                }
            }
        } else {
            const v = extractItemValue(raw, route.itemValuePath);
            if (v) values.push(v);
        }
        if (values.length === 0) continue;
        view[route.sourceField] = {
            sourceField: route.sourceField,
            nodeType: route.nodeType,
            dataField: route.dataField,
            expandEach: Boolean(route.expandEach),
            values,
        };
    }
    return view;
}
