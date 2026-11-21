import type { ResolvedOutputRoute } from "../../../core";
import type { PossibleNode } from "../../hooks/use-flow";

type ExpandsFn = (nodeId: string | null, nodes: PossibleNode[]) => string[];

/**
 * The ABI output view: one source of truth with the workflow engine
 * (`tongflow/engine`), which projects every node's output the same way.
 */
export {
    type AbiOutputChannel,
    type AbiOutputView,
    computeOutputView,
} from "../../../engine/output-view";

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
