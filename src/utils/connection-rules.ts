/**
 * React Flow 连线校验：按节点「逻辑输出类型」与目标节点 paramMappings 中的 upstream 声明匹配。
 */

import type { Connection, Edge, Node } from "@xyflow/react";
import { DATA_NODE_TYPES } from "./executable-workflow";
import {
    getNodeExecutionConfig,
    type NodeExecutionConfig,
    type ParamMappingConfig,
} from "./node-execution-config";

/** 文本生成音乐节点：曲风 / 歌词 输入口（单口仅允许一条边） */
export const TEXT_GEN_MUSIC_HANDLES = {
    style: "in:style",
    lyric: "in:lyric",
} as const;

const SINGLE_EDGE_TARGET_HANDLES = new Set<string>([
    TEXT_GEN_MUSIC_HANDLES.style,
    TEXT_GEN_MUSIC_HANDLES.lyric,
]);

/** Add 节点类型 → 逻辑输出类型（与 workflow-exporter getAddNodeOutputType 一致） */
const ADD_NODE_OUTPUT_TYPE: Record<string, string> = {
    addImageNode: "imageNode",
    addVideoNode: "videoNode",
    addAudioNode: "audioNode",
    addTextNode: "textNode",
    addModelNode: "modelNode",
    addFileNode: "fileNode",
    addLinkNode: "textNode",
};

function getNodeConfigFromData(
    nodeData: Record<string, unknown>,
): NodeExecutionConfig | undefined {
    const feature = nodeData.feature as string | undefined;
    const paramMappings = nodeData.paramMappings as
        | Record<string, ParamMappingConfig>
        | undefined;
    if (!feature || !paramMappings) return undefined;
    return {
        nodeType: "",
        feature,
        outputType: nodeData.outputType as string | undefined,
        outputField: nodeData.outputField as "fileKeys" | "texts" | undefined,
        paramMappings,
        supportsBatch: nodeData.supportsBatch as boolean | undefined,
        batchParam: nodeData.batchParam as string | undefined,
        label: nodeData.label as string | undefined,
    };
}

function getEffectiveNodeConfig(
    nodeType: string,
    nodeData: Record<string, unknown>,
): NodeExecutionConfig | undefined {
    return getNodeExecutionConfig(nodeType) ?? getNodeConfigFromData(nodeData);
}

/**
 * 源节点的「逻辑输出类型」：数据节点即自身类型；处理/Add 节点用 outputType 或映射。
 */
export function getEffectiveOutputType(
    nodeType: string | undefined,
    nodeData?: Record<string, unknown> | null,
): string | undefined {
    if (!nodeType) return undefined;
    if (nodeType in DATA_NODE_TYPES) return nodeType;
    if (nodeData?.outputType && typeof nodeData.outputType === "string") {
        return nodeData.outputType;
    }
    const fromAdd = ADD_NODE_OUTPUT_TYPE[nodeType];
    if (fromAdd) return fromAdd;
    const cfg = getNodeExecutionConfig(nodeType);
    return cfg?.outputType;
}

function collectUpstreamTypesFromConfig(
    config: NodeExecutionConfig,
): Set<string> {
    const out = new Set<string>();
    const mappings = config.paramMappings ?? {};
    for (const mapping of Object.values(mappings)) {
        for (const src of mapping.sources ?? []) {
            if (src.type === "upstream" && src.upstreamType) {
                out.add(src.upstreamType);
            }
        }
    }
    return out;
}

function normalizeTargetHandle(id: string | null | undefined): string {
    return id ?? "a";
}

/**
 * 是否已存在占用同一 targetHandle 的入边（用于 in:style / in:lyric 等单槽位）
 */
export function hasDuplicateTargetHandle(
    edges: Edge[],
    connection: Connection,
): boolean {
    const th = connection.targetHandle;
    if (!th || !SINGLE_EDGE_TARGET_HANDLES.has(th)) return false;
    return edges.some(
        (e) =>
            e.target === connection.target &&
            normalizeTargetHandle(e.targetHandle) === th,
    );
}

/**
 * 校验连线是否允许。未知配置时宽松放行，避免未注册节点无法连线。
 */
export function isValidFlowConnection(
    connection: Connection,
    nodes: Node[],
    edges: Edge[],
): boolean {
    const source = connection.source;
    const target = connection.target;
    if (!source || !target || source === target) return false;

    if (hasDuplicateTargetHandle(edges, connection)) return false;

    const sourceNode = nodes.find((n) => n.id === source);
    const targetNode = nodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) return false;

    const sourceData = (sourceNode.data as Record<string, unknown>) ?? {};
    const targetData = (targetNode.data as Record<string, unknown>) ?? {};
    const outType = getEffectiveOutputType(sourceNode.type, sourceData);
    if (!outType) return true;

    const targetType = targetNode.type ?? "";

    // 数据节点作为目标：仅接受「逻辑输出类型」与自身类型一致的上游
    if (targetType in DATA_NODE_TYPES) {
        return outType === targetType;
    }

    // 文本生成音乐：语义口仅接受文本类输出
    if (targetType === "textGenMusicNode") {
        const th = connection.targetHandle;
        if (
            th === TEXT_GEN_MUSIC_HANDLES.style ||
            th === TEXT_GEN_MUSIC_HANDLES.lyric
        ) {
            return outType === "textNode";
        }
    }

    const cfg = getEffectiveNodeConfig(targetType, targetData);
    const allowed = cfg
        ? collectUpstreamTypesFromConfig(cfg)
        : new Set<string>();

    if (!cfg || allowed.size === 0) {
        return true;
    }

    return allowed.has(outType);
}
