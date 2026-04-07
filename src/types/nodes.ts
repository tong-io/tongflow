import type { Node } from "@xyflow/react";

/* ========================================================================== */
/* 基础类型定义                                                                 */
/* ========================================================================== */

/**
 * 输出节点类型
 */
export type OutputNodeType =
    | "textNode"
    | "imageNode"
    | "audioNode"
    | "videoNode"
    | "modelNode";

/**
 * 处理节点的数据结构
 * 包含 feature、prompt 和输出配置，可直接用于后端执行
 */
export interface TransferNodeData extends Record<string, unknown> {
    /** 功能标识，对应后端 API */
    feature: string;
    /** 执行参数，直接提交给后端 */
    prompt: Record<string, unknown>;
    /** 输出节点类型，如 "audioNode"、"videoNode"、"textNode" 等 */
    outputType?: OutputNodeType;
    /** 输出数据字段，"fileKeys" 或 "texts" */
    outputField?: "fileKeys" | "texts";
}

/**
 * 合成节点的数据结构
 * 包含 feature、ids（连接的节点）和输出配置
 */
export interface ComposeNodeData extends Record<string, unknown> {
    /** 功能标识，对应后端 API */
    feature: string;
    /** 连接的上游节点 ID 列表 */
    ids: string[];
    /** 输出节点类型 */
    outputType?: OutputNodeType;
    /** 输出数据字段 */
    outputField?: "fileKeys" | "texts";
}

/**
 * 数据节点的基础数据结构
 */
export interface DataNodeData extends Record<string, unknown> {
    /** 文本数组 */
    texts?: string[];
    /** 文件 key 数组 */
    fileKeys?: string[];
}

/* ==========================================================================
/* 原有类型定义（保持兼容）                                                      */
/* ========================================================================== */

export interface TextNodeData extends Record<string, unknown> {
    texts: string[];
}

export interface AddTextNodeData extends Record<string, unknown> {
    taskId?: string;
    query?: string;
    activeTab?: string;
    texts?: string[];
    locked?: boolean;
}

export interface GenTextNodeData extends Record<string, unknown> {
    prompt?: string;
    texts?: string[];
}

export interface BatchTask {
    feature: string;
    prompt: {
        text: string;
    };
    nodeId: string;
    data?: {
        text?: string;
    };
}

export type AddTextNode = Node<AddTextNodeData>;
export type TextNode = Node<TextNodeData>;
export type GenTextNode = Node<GenTextNodeData>;
