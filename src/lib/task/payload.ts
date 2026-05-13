import type { PossibleNode } from "@/hooks/use-flow";
import type { ResolvedOutputRoute } from "@/lib/schema/tongflow-abi";

type ExpandsFn = (nodeId: string | null, nodes: PossibleNode[]) => string[];

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
                // one-per-item
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
                        expands(nodeId, [
                            {
                                type: route.nodeType,
                                data: { [route.dataField]: [value] },
                            },
                        ]);
                    }
                }
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
