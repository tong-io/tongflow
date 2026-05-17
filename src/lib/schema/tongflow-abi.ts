import { z } from "zod";
import { MIN_SUPPORTED_ABI_VERSION } from "@/lib/schema/abi-version";
import tongflowAbi from "../../../config/tongflow.abi.json";

const AbiNodeSchema = z.object({
    nodeSlot: z.string().min(1),
    inputs: z.unknown(),
    outputs: z.unknown(),
});

const TongflowAbiFileSchema = z.object({
    version: z.number().int().min(MIN_SUPPORTED_ABI_VERSION),
    source: z.string().optional(),
    $defs: z.record(z.string(), z.unknown()).optional(),
    nodes: z.array(AbiNodeSchema),
});

export type TongflowAbiNode = z.infer<typeof AbiNodeSchema>;

export interface ResolvedOutputRoute {
    sourceField: string;
    nodeType:
        | "videoNode"
        | "audioNode"
        | "imageNode"
        | "textNode"
        | "modelNode"
        | "fileNode";
    dataField: "fileKeys" | "texts";
    expandEach: boolean;
    itemValuePath?: string;
    isArrayOfArrays?: boolean;
}

const REF_TO_NODE_TYPE: Record<
    string,
    Exclude<ResolvedOutputRoute["nodeType"], "textNode">
> = {
    VideoRef: "videoNode",
    AudioRef: "audioNode",
    ImageRef: "imageNode",
    ModelRef: "modelNode",
    FileRef: "fileNode",
};

type JsonSchema = Record<string, unknown>;

function resolveRef(refStr: string): string {
    // "#/$defs/VideoRef" -> "VideoRef"
    return refStr.split("/").pop() ?? "";
}

export function resolveAbiOutputMappings(
    node: TongflowAbiNode,
): ResolvedOutputRoute[] {
    const outputs = node.outputs as JsonSchema | undefined;
    if (!outputs || typeof outputs !== "object") return [];

    const properties = outputs.properties as
        | Record<string, JsonSchema>
        | undefined;
    if (!properties) return [];

    const routes: ResolvedOutputRoute[] = [];

    for (const [field, schema] of Object.entries(properties)) {
        if (field === "success" || field === "error" || field === "thinking") {
            continue;
        }

        const ref = schema["$ref"] as string | undefined;
        if (ref) {
            const refName = resolveRef(ref);
            const nodeType = REF_TO_NODE_TYPE[refName];
            if (nodeType) {
                routes.push({
                    sourceField: field,
                    nodeType,
                    dataField: "fileKeys",
                    expandEach: false,
                    itemValuePath: "file_key",
                });
            }
            continue;
        }

        // Primitive string output → single text route.
        if (schema.type === "string") {
            routes.push({
                sourceField: field,
                nodeType: "textNode",
                dataField: "texts",
                expandEach: false,
            });
            continue;
        }

        if (schema.type === "array") {
            const items = schema.items as JsonSchema | undefined;
            if (!items) continue;

            const expandEach = schema["x-expand-each"] === true;

            const itemRef = items["$ref"] as string | undefined;
            if (itemRef) {
                const refName = resolveRef(itemRef);
                const nodeType = REF_TO_NODE_TYPE[refName];
                if (nodeType) {
                    routes.push({
                        sourceField: field,
                        nodeType,
                        dataField: "fileKeys",
                        expandEach,
                        itemValuePath: "file_key",
                    });
                }
                continue;
            }

            // array of arrays (e.g. groups: VideoRef[][])
            if (items.type === "array") {
                const innerItems = items.items as JsonSchema | undefined;
                if (!innerItems) continue;
                const innerRef = innerItems["$ref"] as string | undefined;
                if (innerRef) {
                    const refName = resolveRef(innerRef);
                    const nodeType = REF_TO_NODE_TYPE[refName];
                    if (nodeType) {
                        routes.push({
                            sourceField: field,
                            nodeType,
                            dataField: "fileKeys",
                            expandEach: true,
                            itemValuePath: "file_key",
                            isArrayOfArrays: true,
                        });
                    }
                }
                continue;
            }

            // array of strings → textNode (single combined if !expandEach, one-per if x-expand-each)
            if (items.type === "string") {
                routes.push({
                    sourceField: field,
                    nodeType: "textNode",
                    dataField: "texts",
                    expandEach,
                });
            }
        }
    }

    return routes;
}

const parsed = TongflowAbiFileSchema.parse(tongflowAbi);

const bySlot = new Map<string, TongflowAbiNode>();
for (const n of parsed.nodes) {
    bySlot.set(n.nodeSlot, n);
}

export const TONGFLOW_ABI_VERSION = parsed.version;
export const TONGFLOW_ABI_NODES: readonly TongflowAbiNode[] = parsed.nodes;

export function getAbiNodeBySlot(
    nodeSlot: string,
): TongflowAbiNode | undefined {
    return bySlot.get(nodeSlot);
}

/**
 * Memoized output-route lookup keyed by ABI slot. The exporter, workflow
 * runner, and SSE hooks all need the same routes — share the cache.
 */
const ROUTES_CACHE = new Map<string, ResolvedOutputRoute[]>();

export function getAbiOutputRoutesBySlot(
    nodeSlot: string,
): ResolvedOutputRoute[] {
    const cached = ROUTES_CACHE.get(nodeSlot);
    if (cached) return cached;
    const node = bySlot.get(nodeSlot);
    const routes = node ? resolveAbiOutputMappings(node) : [];
    ROUTES_CACHE.set(nodeSlot, routes);
    return routes;
}

export { MIN_SUPPORTED_ABI_VERSION };
