/**
 * 节点执行配置类型定义
 * 每个节点组件都应该导出自己的执行配置
 */

import type { ParamSource } from "./executable-workflow";

/**
 * 参数映射定义（简化版本，用于节点自包含配置）
 */
export interface ParamSourceConfig {
    /** 参数来源优先级 */
    type: ParamSource;
    /** 上游节点类型（upstream 时） */
    upstreamType?: string;
    /** 上游字段 */
    upstreamField?: string;
    /** 配置路径 */
    configPath?: string;
    /** 输入名称（input 时） */
    inputName?: string;
    /** 是否需要 URL 转换 */
    needsUrlTransform?: boolean;
    /** 是否收集所有匹配类型的上游节点数据（用于 Compose 节点） */
    collectAll?: boolean;
    /** 目标节点上的 Handle id（多槽位同类型输入时匹配入边 targetHandle） */
    targetHandle?: string;
    /** 默认值 */
    defaultValue?: unknown;
}

/**
 * 参数映射配置
 */
export interface ParamMappingConfig {
    /** 参数来源优先级列表 */
    sources: ParamSourceConfig[];
    /** 是否必填 */
    required?: boolean;
}

/**
 * 上游数据获取器类型
 * 用于在执行时实时获取上游节点的数据
 */
export type UpstreamDataGetter = (
    upstreamType: string,
    field: string,
) => unknown;

/**
 * 获取所有匹配类型的上游数据
 */
export type AllUpstreamDataGetter = (
    upstreamType: string,
    field: string,
) => unknown[];

/**
 * getPrompts 函数的上下文参数
 */
export type UpstreamDataByTargetHandleGetter = (
    targetHandle: string,
    upstreamType: string,
    field: string,
) => unknown;

export interface GetPromptsContext {
    /** 获取单个上游节点的数据 */
    getUpstreamData: UpstreamDataGetter;
    /** 获取所有匹配类型的上游节点数据（合并为数组） */
    getAllUpstreamData: AllUpstreamDataGetter;
    /** 按目标 Handle 取单路上游（多槽位同类型，如曲风/歌词） */
    getUpstreamDataForTargetHandle?: UpstreamDataByTargetHandleGetter;
}

/**
 * 节点执行配置
 * 每个可执行节点组件都应该导出此配置
 */
export interface NodeExecutionConfig {
    /** 节点类型名称（必须与组件注册的 type 一致） */
    nodeType: string;
    /** 后端 feature 名称 */
    feature: string;
    /** 节点标签（用于工作流导出时的节点标识） */
    label?: string;
    /** 节点显示名称（用于 Header 标题和移动端执行进度显示） */
    title?: string;
    /** 节点图标（用于 Header 显示） */
    icon?: React.ReactNode;
    /** 自定义 Header Actions（在菜单按钮之前显示） */
    headerActions?: React.ReactNode;
    /** 执行按钮文字，默认为 "执行" */
    executeLabel?: string;
    /** 执行按钮图标 */
    executeIcon?: React.ReactNode;
    /** 是否禁用执行按钮 */
    executeDisabled?: boolean;
    /**
     * 获取执行参数的函数
     * 返回 prompt 数组，每个 prompt 会创建一个任务
     * 如果返回空数组，则不执行
     *
     * @param context 上下文，包含获取上游数据的函数
     *   - getUpstreamData(type, field): 获取单个上游节点的数据
     *   - getAllUpstreamData(type, field): 获取所有匹配类型的上游节点数据
     *
     * @example
     * ```ts
     * getPrompts: (ctx) => {
     *   // 从上游 audioNode 获取最新的 fileKeys
     *   const fileKeys = ctx?.getAllUpstreamData("audioNode", "fileKeys") as string[];
     *   return fileKeys.map(key => ({ fileKey: key }));
     * }
     * ```
     */
    getPrompts?: (context?: GetPromptsContext) => Record<string, unknown>[];
    /**
     * 自定义任务更新处理（可选）
     * 用于处理流式输出等需要响应中间状态的场景
     * 如果提供，会在每次任务更新时调用（包括 streaming、completed、failed）
     * 返回 true 表示已处理，不再执行默认逻辑
     */
    onTaskUpdate?: (task: any) => boolean | void | Promise<boolean | void>;
    /** 输出类型（对应的数据节点类型） */
    outputType?: string;
    /** 输出字段 */
    outputField?: "fileKeys" | "texts";
    /** 参数映射定义 */
    paramMappings?: Record<string, ParamMappingConfig>;
    /** 是否支持批量执行 */
    supportsBatch?: boolean;
    /** 批量执行的参数名 */
    batchParam?: string;
    /**
     * 是否为输入节点（起始节点）
     * 如 add-image、add-text 等无上游依赖的节点
     * 设置为 true 时，执行模式下也会显示执行按钮（如上传、添加等）
     */
    isInputNode?: boolean;
}

/**
 * 节点执行配置注册表
 * 用于收集所有节点的执行配置
 */
const nodeExecutionConfigRegistry = new Map<string, NodeExecutionConfig>();

/**
 * 注册节点执行配置
 * 注意：React Strict Mode 下 effects 会运行两次，所以相同配置的重复注册是正常的
 */
export function registerNodeExecutionConfig(config: NodeExecutionConfig): void {
    const existing = nodeExecutionConfigRegistry.get(config.nodeType);
    // 如果已存在相同的配置，跳过（React Strict Mode 会导致重复注册）
    if (existing && existing.feature === config.feature) {
        return;
    }
    if (existing) {
        console.warn(
            `[NodeExecutionConfig] Overwriting config for node type: ${config.nodeType}`,
        );
    }
    nodeExecutionConfigRegistry.set(config.nodeType, config);
}

/**
 * 获取节点执行配置
 */
export function getNodeExecutionConfig(
    nodeType: string,
): NodeExecutionConfig | undefined {
    return nodeExecutionConfigRegistry.get(nodeType);
}

/**
 * 获取所有已注册的节点执行配置
 */
export function getAllNodeExecutionConfigs(): Map<string, NodeExecutionConfig> {
    return nodeExecutionConfigRegistry;
}

/**
 * 检查节点类型是否已注册
 */
export function hasNodeExecutionConfig(nodeType: string): boolean {
    return nodeExecutionConfigRegistry.has(nodeType);
}

/* ========================================================================== */
/* 便捷的配置构建器                                                             */
/* ========================================================================== */

/**
 * 创建上游参数配置
 */
export function upstreamParam(
    upstreamType: string,
    upstreamField: string,
    options?: {
        needsUrlTransform?: boolean;
        collectAll?: boolean;
        targetHandle?: string;
    },
): ParamSourceConfig {
    return {
        type: "upstream",
        upstreamType,
        upstreamField,
        needsUrlTransform: options?.needsUrlTransform,
        collectAll: options?.collectAll,
        targetHandle: options?.targetHandle,
    };
}

/**
 * 创建配置参数
 */
export function configParam(
    configPath: string,
    defaultValue?: unknown,
): ParamSourceConfig {
    return {
        type: "config",
        configPath,
        defaultValue,
    };
}

/**
 * 创建静态参数
 */
export function staticParam(value: unknown): ParamSourceConfig {
    return {
        type: "static",
        defaultValue: value,
    };
}

/**
 * 创建输入参数
 */
export function inputParam(inputName: string): ParamSourceConfig {
    return {
        type: "input",
        inputName,
    };
}
