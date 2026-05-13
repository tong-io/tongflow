import type { BaseNodeData } from "@/types/nodes";

/**
 * Narrow unknown RF `node.data` (store / composite reads) to `BaseNodeData`.
 * Prefer typed `NodeProps<Node<BaseNodeData, …>>` on components; use this where
 * the graph edge does not carry a concrete literal (e.g. `useNodesData`).
 */
export function coerceBaseNodeData(data: unknown): BaseNodeData {
    if (data !== null && typeof data === "object") return data as BaseNodeData;
    return {};
}
