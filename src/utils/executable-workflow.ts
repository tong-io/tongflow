/**
 * 可执行工作流定义
 * 用于导出可被后端独立执行的工作流 JSON
 */

import type { Node, Edge } from "@xyflow/react";

/* ========================================================================== */
/* 类型定义                                                                    */
/* ========================================================================== */

/**
 * 参数来源类型
 */
export type ParamSource =
    | "static" // 静态值，直接使用 value
    | "upstream" // 来自上游节点的输出
    | "input" // 用户输入（工作流执行时提供）
    | "config"; // 节点配置项

/**
 * 参数映射定义
 */
export interface ParamMapping {
    /** 参数来源 */
    source: ParamSource;
    /** 上游节点 ID（source 为 upstream 时必填） */
    nodeId?: string;
    /** 多个上游节点 ID（collectAll 模式下使用） */
    nodeIds?: string[];
    /** 上游节点输出字段（source 为 upstream 时必填），如 "fileKeys[0]", "texts", "fileKeys" */
    field?: string;
    /** 静态值（source 为 static 时使用） */
    value?: unknown;
    /** 输入参数名称（source 为 input 时使用，用于标识工作流输入） */
    inputName?: string;
    /** 配置字段路径（source 为 config 时使用） */
    configPath?: string;
    /** 是否为数组，如果是，会对数组中每个元素执行 */
    isArray?: boolean;
    /** 数组索引（如果需要取数组中特定元素） */
    arrayIndex?: number;
    /** 转换函数名称（可选，如 "getR2Url"） */
    transform?: string;
    /** 入边目标 Handle（多槽位时与画布 edge.targetHandle 对应） */
    edgeTargetHandle?: string;
}

/**
 * 可执行节点定义
 */
export interface ExecutableNode {
    /** 节点 ID */
    id: string;
    /** 节点类型 */
    type: string;
    /** 后端 API 功能标识 */
    feature: string;
    /** 节点显示名称（用于移动端执行进度显示） */
    label?: string;
    /** 节点备注（用于移动端执行进度显示） */
    comment?: string;
    /** 是否锁定（锁定的节点在移动端执行时不允许编辑） */
    locked?: boolean;
    /** 输入参数映射 */
    inputMapping: Record<string, ParamMapping>;
    /** 输出类型 */
    outputType: string;
    /** 输出字段 */
    outputField: "fileKeys" | "texts";
    /** 是否为批量执行（对数组中每个元素分别执行） */
    isBatch?: boolean;
    /** 批量执行的数组参数名 */
    batchParam?: string;
    /** 依赖的上游节点 ID */
    dependencies: string[];
    /** 执行层级（用于确定并行执行组） */
    level: number;
    /** 直连的下游数据节点 ID（执行完成后更新该节点的数据） */
    downstreamDataNodeId?: string;
    /** 节点原始配置数据（用于 UI 恢复） */
    rawConfig?: Record<string, unknown>;
}

/**
 * 数据节点定义（入口节点，提供初始数据）
 */
export interface DataNode {
    /** 节点 ID */
    id: string;
    /** 节点类型 */
    type: string;
    /** 数据类型 */
    dataType: "text" | "image" | "audio" | "video" | "model" | "file";
    /** 节点显示名称（用于移动端执行进度显示） */
    label?: string;
    /** 节点备注（用于移动端执行进度显示） */
    comment?: string;
    /** 是否为工作流输入点 */
    isInput: boolean;
    /** 输入名称（用于工作流执行时提供数据） */
    inputName?: string;
    /** 静态数据（如果有） */
    staticData?: {
        texts?: string[];
        fileKeys?: string[];
    };
    /** 执行层级 */
    level: number;
}

/**
 * 工作流输入定义
 */
export interface WorkflowInput {
    /** 输入名称 */
    name: string;
    /** 输入类型 */
    type:
        | "text"
        | "image"
        | "audio"
        | "video"
        | "model"
        | "file"
        | "text[]"
        | "file[]";
    /** 描述 */
    description?: string;
    /** 是否必填 */
    required: boolean;
    /** 默认值 */
    defaultValue?: unknown;
    /** 关联的节点 ID */
    nodeId: string;
}

/**
 * 工作流输出定义
 */
export interface WorkflowOutput {
    /** 输出名称 */
    name: string;
    /** 输出类型 */
    type:
        | "text"
        | "image"
        | "audio"
        | "video"
        | "model"
        | "file"
        | "text[]"
        | "file[]";
    /** 来源节点 ID */
    nodeId: string;
    /** 来源字段 */
    field: string;
}

/**
 * 可执行工作流定义
 */
export interface ExecutableWorkflow {
    /** 工作流名称 */
    name: string;
    /** 工作流描述 */
    description?: string;
    /** 版本号 */
    version: string;
    /** 导出时间 */
    exportedAt: string;
    /** 工作流输入定义 */
    inputs: WorkflowInput[];
    /** 工作流输出定义 */
    outputs: WorkflowOutput[];
    /** 数据节点（入口节点） */
    dataNodes: DataNode[];
    /** 可执行节点（按执行层级排序） */
    executableNodes: ExecutableNode[];
    /** 执行层级（每层可并行执行） */
    executionLevels: string[][];
    /** 数据节点之间的边关系（用于输入透传） */
    dataNodeEdges: Array<{ source: string; target: string }>;
    /** 原始 flow 数据（用于 UI 恢复） */
    originalFlow: {
        nodes: Node[];
        edges: Edge[];
    };
}

/* ========================================================================== */
/* 数据节点类型映射                                                             */
/* ========================================================================== */

/**
 * 数据节点类型映射
 */
export const DATA_NODE_TYPES: Record<
    string,
    { dataType: DataNode["dataType"]; outputField: "fileKeys" | "texts" }
> = {
    textNode: { dataType: "text", outputField: "texts" },
    imageNode: { dataType: "image", outputField: "fileKeys" },
    audioNode: { dataType: "audio", outputField: "fileKeys" },
    videoNode: { dataType: "video", outputField: "fileKeys" },
    modelNode: { dataType: "model", outputField: "fileKeys" },
    fileNode: { dataType: "file", outputField: "fileKeys" },
};
