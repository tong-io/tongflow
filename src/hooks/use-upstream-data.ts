/**
 * 获取上游节点数据的 Hook
 * 用于处理节点在执行时实时从前置数据节点拉取最新数据
 */

import { useCallback } from "react";
import { useNodeId, useStore } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";

/**
 * 从嵌套路径获取数据
 * 支持 "fileKeys[0]" 或 "texts" 这样的路径
 */
function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
    // 处理数组索引，如 "fileKeys[0]"
    const arrayMatch = path.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
        const [, key, indexStr] = arrayMatch;
        const arr = obj[key];
        if (Array.isArray(arr)) {
            return arr[parseInt(indexStr, 10)];
        }
        return undefined;
    }

    // 普通字段访问
    return obj[path];
}

/**
 * 获取上游节点数据的配置
 */
export interface UpstreamDataConfig {
    /** 上游节点类型 */
    upstreamType: string;
    /** 要获取的数据字段路径，如 "fileKeys" 或 "fileKeys[0]" */
    field: string;
}

/** 与 {@link UpstreamDataConfig} 相同，并指定当前节点目标 Handle（多槽位同类型输入） */
export type UpstreamDataByTargetHandleConfig = UpstreamDataConfig & {
    targetHandle: string;
};

/**
 * Hook: 获取指定上游节点的数据
 *
 * @param config 配置，指定上游节点类型和字段
 * @returns 一个获取函数，调用时返回上游数据
 *
 * @example
 * ```tsx
 * const getUpstreamData = useUpstreamData({
 *   upstreamType: "audioNode",
 *   field: "fileKeys"
 * });
 *
 * // 在执行时调用
 * const fileKeys = getUpstreamData(); // 实时获取上游节点的 fileKeys
 * ```
 */
export function useUpstreamData(config: UpstreamDataConfig) {
    const nodeId = useNodeId();

    // 获取 edges 和 nodes 的 lookup
    const getUpstreamNode = useStore(
        useCallback(
            (state) => {
                if (!nodeId) return null;

                // 找到连接到当前节点的边（target 是当前节点）
                const incomingEdges = (state.edges as Edge[]).filter(
                    (edge) => edge.target === nodeId,
                );

                // 遍历上游节点，找到匹配类型的
                for (const edge of incomingEdges) {
                    const sourceNode = state.nodeLookup.get(edge.source);
                    if (sourceNode && sourceNode.type === config.upstreamType) {
                        return sourceNode as Node;
                    }
                }

                return null;
            },
            [nodeId, config.upstreamType],
        ),
    );

    // 返回一个获取数据的函数
    const getData = useCallback(() => {
        if (!getUpstreamNode) return undefined;
        const data = getUpstreamNode.data as Record<string, unknown>;
        return getValueByPath(data, config.field);
    }, [getUpstreamNode, config.field]);

    return getData;
}

/**
 * Hook: 获取所有上游节点的数据
 *
 * @returns 一个函数，接受上游类型和字段，返回对应的数据
 *
 * @example
 * ```tsx
 * const getUpstreamDataByType = useUpstreamDataGetter();
 *
 * // 在执行时调用
 * const audioFiles = getUpstreamDataByType("audioNode", "fileKeys");
 * const imageFiles = getUpstreamDataByType("imageNode", "fileKeys");
 * ```
 */
export function useUpstreamDataGetter() {
    const nodeId = useNodeId();

    // 获取一个可以查询任意上游节点的函数
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const getUpstreamData = useCallback(
        (upstreamType: string, field: string): unknown => {
            if (!nodeId) return undefined;

            // 找到连接到当前节点的边
            const incomingEdges = edges.filter(
                (edge) => edge.target === nodeId,
            );

            // 遍历上游节点，找到匹配类型的
            for (const edge of incomingEdges) {
                const sourceNode = nodeLookup.get(edge.source);
                if (sourceNode && sourceNode.type === upstreamType) {
                    const data = sourceNode.data as Record<string, unknown>;
                    return getValueByPath(data, field);
                }
            }

            return undefined;
        },
        [nodeId, nodeLookup, edges],
    );

    return getUpstreamData;
}

/**
 * Hook: 获取所有上游节点（按类型分组）
 *
 * @returns 获取函数，返回指定类型的所有上游节点数据
 */
export function useAllUpstreamData() {
    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const getAllUpstreamByType = useCallback(
        (upstreamType: string, field: string): unknown[] => {
            if (!nodeId) return [];

            const incomingEdges = edges.filter(
                (edge) => edge.target === nodeId,
            );

            const results: unknown[] = [];
            for (const edge of incomingEdges) {
                const sourceNode = nodeLookup.get(edge.source);
                if (sourceNode && sourceNode.type === upstreamType) {
                    const data = sourceNode.data as Record<string, unknown>;
                    const value = getValueByPath(data, field);
                    if (value !== undefined) {
                        // 如果值是数组，展开它
                        if (Array.isArray(value)) {
                            results.push(...value);
                        } else {
                            results.push(value);
                        }
                    }
                }
            }

            return results;
        },
        [nodeId, nodeLookup, edges],
    );

    return getAllUpstreamByType;
}

/**
 * 按目标 Handle 取单路上游（需与画布上该 Handle 的 id 一致，如 in:style / in:lyric）
 */
export function useUpstreamDataForTargetHandle(
    config: UpstreamDataByTargetHandleConfig,
) {
    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    return useCallback(() => {
        if (!nodeId) return undefined;
        const incomingEdges = edges.filter(
            (edge) =>
                edge.target === nodeId &&
                (edge.targetHandle ?? "a") === config.targetHandle,
        );
        for (const edge of incomingEdges) {
            const sourceNode = nodeLookup.get(edge.source);
            if (sourceNode && sourceNode.type === config.upstreamType) {
                const data = sourceNode.data as Record<string, unknown>;
                return getValueByPath(data, config.field);
            }
        }
        return undefined;
    }, [
        nodeId,
        edges,
        nodeLookup,
        config.targetHandle,
        config.upstreamType,
        config.field,
    ]);
}
