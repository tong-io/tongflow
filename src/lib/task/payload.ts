import type { PossibleNode } from "@/hooks/use-flow";
import type { ResolvedOutputRoute } from "@/lib/schema/tongflow-abi";

type ExpandsFn = (nodeId: string | null, nodes: PossibleNode[]) => string[];

/**
 * Pure projection of a plugin output, indexed by ABI source field. Used
 * server-side by the workflow runner (no canvas context) and shared with the
 * SSE consumer to keep edit-mode and execution-mode in sync.
 *
 * Each channel's `values` is normalized to a flat string[]:
 *  - asset $ref objects → `itemValuePath` (typically `file_key`) is extracted.
 *  - scalar string / Asset → wrapped in a single-element array.
 *  - arrays are flattened; array-of-arrays loses its grouping here and must be
 *    handled separately by canvas-side `applyResolvedOutputRoutes` if needed.
 */
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
    routes: ResolvedOutputRoute[],
    payload: Record<string, unknown> | undefined,
): AbiOutputView {
    const view: AbiOutputView = {};
    if (!payload) return view;
    for (const route of routes) {
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
            expandEach: route.expandEach,
            values,
        };
    }
    return view;
}

export function applyResolvedOutputRoutes(
    nodeId: string,
    payload: Record<string, unknown> | undefined,
    routes: ResolvedOutputRoute[],
    expands: ExpandsFn,
): void {
    for (const route of routes) {
        const raw = payload?.[route.sourceField];
        if (raw == null) continue;

        if (Array.isArray(raw)) {
            if (route.isArrayOfArrays) {
                // e.g. groups: VideoRef[][] — each inner array → one node
                for (const innerArr of raw as unknown[]) {
                    if (!Array.isArray(innerArr)) continue;
                    const keys = (innerArr as unknown[])
                        .map((item) =>
                            route.itemValuePath &&
                            typeof item === "object" &&
                            item !== null
                                ? String(
                                      (item as Record<string, unknown>)[
                                          route.itemValuePath
                                      ],
                                  )
                                : String(item),
                        )
                        .filter(Boolean);
                    if (keys.length) {
                        expands(nodeId, [
                            {
                                type: route.nodeType,
                                data: { [route.dataField]: keys },
                            },
                        ]);
                    }
                }
                continue;
            }

            if (route.expandEach) {
                // One downstream node per item, all of the same type.
                // Pass the full batch in a single call so the canvas can
                // reuse existing same-type siblings in order rather than
                // collapsing them via singleton-by-type reuse.
                const items: PossibleNode[] = [];
                for (const item of raw as unknown[]) {
                    const value =
                        route.itemValuePath &&
                        typeof item === "object" &&
                        item !== null
                            ? String(
                                  (item as Record<string, unknown>)[
                                      route.itemValuePath
                                  ],
                              )
                            : String(item);
                    if (value) {
                        items.push({
                            type: route.nodeType,
                            data: { [route.dataField]: [value] },
                        });
                    }
                }
                if (items.length) expands(nodeId, items);
            } else {
                // all-in-one
                const values = (raw as unknown[])
                    .map((item) =>
                        route.itemValuePath &&
                        typeof item === "object" &&
                        item !== null
                            ? String(
                                  (item as Record<string, unknown>)[
                                      route.itemValuePath
                                  ],
                              )
                            : String(item),
                    )
                    .filter(Boolean);
                if (values.length) {
                    expands(nodeId, [
                        {
                            type: route.nodeType,
                            data: { [route.dataField]: values },
                        },
                    ]);
                }
            }
        } else if (
            typeof raw === "object" &&
            raw !== null &&
            route.itemValuePath
        ) {
            // scalar typed ref (e.g. VideoRef, AudioRef)
            const value = String(
                (raw as Record<string, unknown>)[route.itemValuePath],
            );
            if (value && value !== "undefined") {
                expands(nodeId, [
                    {
                        type: route.nodeType,
                        data: { [route.dataField]: [value] },
                    },
                ]);
            }
        } else if (typeof raw === "string" && raw) {
            expands(nodeId, [
                {
                    type: route.nodeType,
                    data: { [route.dataField]: [raw] },
                },
            ]);
        }
    }
}

/** SSE data is sometimes a JSON string; Modal may wrap content in markdown or nested result. */
export function normalizeTaskPayloadData(
    data: unknown,
): Record<string, unknown> | undefined {
    if (data == null) return undefined;
    if (typeof data === "object" && !Array.isArray(data)) {
        return data as Record<string, unknown>;
    }
    if (typeof data === "string") {
        try {
            const p = JSON.parse(data) as unknown;
            if (typeof p === "object" && p !== null && !Array.isArray(p)) {
                return p as Record<string, unknown>;
            }
        } catch {
            return undefined;
        }
    }
    return undefined;
}
