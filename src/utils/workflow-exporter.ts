/**
 * 工作流导出器
 * 将 ReactFlow 工作流转换为可执行工作流 JSON
 */

import type { Node, Edge } from "@xyflow/react";
import {
    type ExecutableWorkflow,
    type ExecutableNode,
    type DataNode,
    type WorkflowInput,
    type WorkflowOutput,
    type ParamMapping,
    type ParamSource,
    DATA_NODE_TYPES,
} from "./executable-workflow";
import {
    getNodeExecutionConfig,
    type NodeExecutionConfig,
    type ParamMappingConfig,
} from "./node-execution-config";
import { WorkflowParser } from "./workflow-parser";

/**
 * 从 node.data 构建 NodeExecutionConfig
 * 优先使用 node.data 中的配置，这样后端不需要依赖前端运行时注册表
 * 只有当 node.data 中同时有 feature 和 paramMappings 时才返回配置
 */
function getNodeConfigFromData(
    nodeData: Record<string, unknown>,
): NodeExecutionConfig | undefined {
    const feature = nodeData.feature as string | undefined;
    const paramMappings = nodeData.paramMappings as
        | Record<string, ParamMappingConfig>
        | undefined;

    // 必须同时有 feature 和 paramMappings 才认为是完整的配置
    // 否则应该 fallback 到注册表获取完整配置
    if (!feature || !paramMappings) return undefined;

    return {
        nodeType: "", // 后端不需要
        feature,
        outputType: nodeData.outputType as string | undefined,
        outputField: nodeData.outputField as "fileKeys" | "texts" | undefined,
        paramMappings,
        supportsBatch: nodeData.supportsBatch as boolean | undefined,
        batchParam: nodeData.batchParam as string | undefined,
        label: nodeData.label as string | undefined,
    };
}

/**
 * 获取节点执行配置（优先从注册表获取最新配置，fallback 到 node.data）
 */
function getEffectiveNodeConfig(
    nodeType: string,
    nodeData: Record<string, unknown>,
): NodeExecutionConfig | undefined {
    // 优先从运行时注册表读取最新配置（前端场景）
    const registryConfig = getNodeExecutionConfig(nodeType);
    if (registryConfig) return registryConfig;

    // fallback 到 node.data（后端场景或未注册的节点）
    return getNodeConfigFromData(nodeData);
}

/* ========================================================================== */
/* 工具函数                                                                    */
/* ========================================================================== */

/**
 * 从配置路径获取值
 */
function getValueFromPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }

        // 处理数组索引，如 "fileKeys[0]"
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
            const [, key, indexStr] = arrayMatch;
            const arr = (current as Record<string, unknown>)[key];
            if (Array.isArray(arr)) {
                current = arr[parseInt(indexStr, 10)];
            } else {
                return undefined;
            }
        } else {
            current = (current as Record<string, unknown>)[part];
        }
    }

    return current;
}

/**
 * 判断节点是否为数据节点（不需要执行，只提供数据）
 */
function isDataNode(nodeType: string): boolean {
    return nodeType in DATA_NODE_TYPES;
}

/**
 * 判断节点是否为 Add 节点（可能有上传数据或 AI 生成）
 */
function isAddNode(nodeType: string): boolean {
    return nodeType.startsWith("add");
}

/**
 * 获取上游节点数据
 */
function normalizeEdgeTargetHandle(id: string | null | undefined): string {
    return id ?? "a";
}

function getUpstreamNodeData(
    nodeId: string,
    nodes: Node[],
    edges: Edge[],
): {
    node: Node;
    edgeSourceHandle?: string;
    edgeTargetHandle?: string;
}[] {
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    return incomingEdges
        .map((edge) => {
            const node = nodes.find((n) => n.id === edge.source);
            return {
                node: node!,
                edgeSourceHandle: edge.sourceHandle ?? undefined,
                edgeTargetHandle: edge.targetHandle ?? undefined,
            };
        })
        .filter((item) => item.node);
}

/**
 * 根据节点类型从 ids 数组获取上游节点
 */
function getUpstreamNodeByType(
    ids: string[],
    targetType: string,
    nodes: Node[],
    index: number = 0,
): Node | undefined {
    const matchingNodes = nodes.filter(
        (n) => ids.includes(n.id) && n.type === targetType,
    );
    return matchingNodes[index];
}

/* ========================================================================== */
/* 主导出类                                                                    */
/* ========================================================================== */

export interface ExportOptions {
    /** 工作流名称 */
    name?: string;
    /** 工作流描述 */
    description?: string;
    /** 是否包含原始 flow 数据 */
    includeOriginalFlow?: boolean;
}

export class WorkflowExporter {
    private nodes: Node[];
    private edges: Edge[];
    private parser: WorkflowParser;

    constructor(nodes: Node[], edges: Edge[]) {
        this.nodes = nodes;
        this.edges = edges;
        this.parser = new WorkflowParser({ nodes, edges });
    }

    /**
     * 导出为可执行工作流
     */
    export(options: ExportOptions = {}): ExecutableWorkflow {
        const plan = this.parser.generateExecutionPlan();

        const dataNodes: DataNode[] = [];
        const executableNodes: ExecutableNode[] = [];
        const inputs: WorkflowInput[] = [];
        const outputs: WorkflowOutput[] = [];

        // 按层级处理节点
        for (
            let levelIndex = 0;
            levelIndex < plan.levels.length;
            levelIndex++
        ) {
            const level = plan.levels[levelIndex];

            for (const nodeId of level) {
                const node = this.nodes.find((n) => n.id === nodeId);
                if (!node) continue;

                const nodeType = node.type ?? "unknown";
                const nodeData = (node.data as Record<string, unknown>) ?? {};

                // 处理数据节点
                if (isDataNode(nodeType)) {
                    const dataNodeInfo = this.processDataNode(
                        node,
                        levelIndex,
                        inputs,
                    );
                    dataNodes.push(dataNodeInfo);
                    continue;
                }

                // 处理 Add 节点
                if (isAddNode(nodeType)) {
                    const result = this.processAddNode(
                        node,
                        levelIndex,
                        inputs,
                    );
                    if (result.dataNode) {
                        dataNodes.push(result.dataNode);
                    }
                    if (result.executableNode) {
                        executableNodes.push(result.executableNode);
                    }
                    continue;
                }

                // 处理可执行节点
                const execNode = this.processExecutableNode(node, levelIndex);
                if (execNode) {
                    executableNodes.push(execNode);
                }
            }
        }

        // 处理输出节点（出度为 0 的节点）
        const endNodes = this.parser.getEndNodes();
        for (const nodeId of endNodes) {
            const node = this.nodes.find((n) => n.id === nodeId);
            if (!node) continue;

            const nodeType = node.type ?? "unknown";
            const dataTypeInfo = DATA_NODE_TYPES[nodeType];

            if (dataTypeInfo) {
                outputs.push({
                    name: `output_${nodeId.substring(0, 8)}`,
                    type: dataTypeInfo.dataType as WorkflowOutput["type"],
                    nodeId,
                    field: dataTypeInfo.outputField,
                });
            } else {
                // 可执行节点的输出
                const nodeData = (node.data as Record<string, unknown>) ?? {};
                const mapping = getEffectiveNodeConfig(nodeType, nodeData);
                if (mapping && mapping.outputType) {
                    outputs.push({
                        name: `output_${nodeId.substring(0, 8)}`,
                        type: mapping.outputType.replace(
                            "Node",
                            "",
                        ) as WorkflowOutput["type"],
                        nodeId,
                        field: mapping.outputField ?? "output",
                    });
                }
            }
        }

        // 过滤 executionLevels，只保留可执行节点
        const executableNodeIds = new Set(executableNodes.map((n) => n.id));
        const filteredLevels = plan.levels
            .map((level) =>
                level.filter((nodeId) => executableNodeIds.has(nodeId)),
            )
            .filter((level) => level.length > 0); // 移除空层级

        // 提取数据节点之间的边关系（用于输入透传）
        const dataNodeIds = new Set(dataNodes.map((n) => n.id));
        const dataNodeEdges = this.edges
            .filter(
                (edge) =>
                    dataNodeIds.has(edge.source) ||
                    dataNodeIds.has(edge.target),
            )
            .map((edge) => ({ source: edge.source, target: edge.target }));

        return {
            name: options.name ?? "Untitled Workflow",
            description: options.description,
            version: "1.0",
            exportedAt: new Date().toISOString(),
            inputs,
            outputs,
            dataNodes,
            executableNodes,
            executionLevels: filteredLevels,
            dataNodeEdges,
            originalFlow:
                options.includeOriginalFlow !== false
                    ? { nodes: this.nodes, edges: this.edges }
                    : { nodes: [], edges: [] },
        };
    }

    /**
     * 处理数据节点
     */
    private processDataNode(
        node: Node,
        level: number,
        inputs: WorkflowInput[],
    ): DataNode {
        const nodeType = node.type ?? "unknown";
        const nodeData = (node.data as Record<string, unknown>) ?? {};
        const dataTypeInfo = DATA_NODE_TYPES[nodeType];

        // 检查是否有静态数据
        const fileKeys = nodeData.fileKeys as string[] | undefined;
        const texts = nodeData.texts as string[] | undefined;
        const hasStaticData =
            (fileKeys && fileKeys.length > 0) || (texts && texts.length > 0);

        // 如果是入口节点且没有静态数据，创建输入定义
        const isStartNode = this.parser.getStartNodes().includes(node.id);
        const isInput = isStartNode && !hasStaticData;

        if (isInput) {
            const inputName = `input_${node.id.substring(0, 8)}`;
            inputs.push({
                name: inputName,
                type:
                    dataTypeInfo.outputField === "texts" ? "text[]" : "file[]",
                description: `Input data for ${nodeType}`,
                required: true,
                nodeId: node.id,
            });
        }

        // 获取 label 和 comment
        const label = nodeData.label as string | undefined;
        const comment = nodeData.comment as string | undefined;

        return {
            id: node.id,
            type: nodeType,
            dataType: dataTypeInfo.dataType,
            label,
            comment,
            isInput,
            inputName: isInput ? `input_${node.id.substring(0, 8)}` : undefined,
            staticData: hasStaticData ? { fileKeys, texts } : undefined,
            level,
        };
    }

    /**
     * 处理 Add 节点
     */
    private processAddNode(
        node: Node,
        level: number,
        inputs: WorkflowInput[],
    ): { dataNode?: DataNode; executableNode?: ExecutableNode } {
        const nodeType = node.type ?? "unknown";
        const nodeData = (node.data as Record<string, unknown>) ?? {};
        const activeTab = nodeData.activeTab as string | undefined;
        const feature = nodeData.feature as string | undefined;
        const manualValue = nodeData.manualValue as string | undefined;

        // 判断是上传模式（不需要执行，只提供数据）
        // - upload/draw/canvas/lib/library/camera/record 模式：用户上传、选择、录制文件
        // - activeTab 为 undefined：节点尚未配置，默认作为数据节点处理
        // - manual 模式（有 manualValue）：用户手动输入文本，作为数据节点处理
        const isUploadMode =
            activeTab === "upload" ||
            activeTab === "draw" ||
            activeTab === "canvas" || // addImageNode 涂鸦模式
            activeTab === "lib" ||
            activeTab === "library" || // addAudioNode 作品集模式
            activeTab === "camera" ||
            activeTab === "record" ||
            activeTab === undefined;
        // addTextNode 的手动输入模式：有 manualValue 且没有 feature
        const isManualTextMode =
            nodeType === "addTextNode" &&
            manualValue !== undefined &&
            manualValue !== "";
        const fileKeys = nodeData.fileKeys as string[] | undefined;
        const texts = nodeData.texts as string[] | undefined;
        // 对于手动输入模式，将 manualValue 作为 texts 数据
        const effectiveTexts =
            isManualTextMode && (!texts || texts.length === 0)
                ? [manualValue]
                : texts;
        const hasStaticData =
            (fileKeys && fileKeys.length > 0) ||
            (effectiveTexts && effectiveTexts.length > 0);

        // AI 模式或有 feature，作为可执行节点处理
        const hasFeature = !!feature && feature.length > 0;

        // 如果节点本身没有静态数据，尝试从直连的下游 DataNode 获取（透传场景）
        let currentFileKeys = fileKeys;
        let currentTexts = effectiveTexts;
        let hasActualData = hasStaticData;

        if (!hasActualData) {
            const downstreamDataId = this.findDownstreamDataNode(node.id);
            if (downstreamDataId) {
                const downstreamNode = this.nodes.find(
                    (n) => n.id === downstreamDataId,
                );
                const dData = downstreamNode?.data as
                    | Record<string, unknown>
                    | undefined;
                const dFileKeys = dData?.fileKeys as string[] | undefined;
                const dTexts = dData?.texts as string[] | undefined;

                if (
                    (dFileKeys && dFileKeys.length > 0) ||
                    (dTexts && dTexts.length > 0)
                ) {
                    currentFileKeys = dFileKeys;
                    currentTexts = dTexts;
                    hasActualData = true;
                }
            }
        }

        // 如果是上传模式或手动输入模式，且没有 feature，作为数据节点处理
        // 如果是 AI 模式或有 feature，作为可执行节点处理
        if ((isUploadMode || isManualTextMode) && !hasFeature) {
            const outputType = this.getAddNodeOutputType(nodeType);
            const dataTypeInfo = DATA_NODE_TYPES[outputType];

            if (dataTypeInfo) {
                // level=0 的 Add 节点始终标记为 isInput，即使有静态数据
                // 这样 App 端可以覆盖静态数据（用户拍照/上传自己的图片）
                const isStartNode = level === 0;
                const isInput = isStartNode; // Add 节点在 level=0 时始终是输入节点
                const inputName = `input_${node.id.substring(0, 8)}`;

                if (isInput) {
                    inputs.push({
                        name: inputName,
                        type:
                            dataTypeInfo.outputField === "texts"
                                ? "text[]"
                                : "file[]",
                        description: `Input data for ${nodeType}`,
                        required: !hasStaticData, // 如果节点本身没有固化数据，标记为必填以在 UI 上提醒
                        defaultValue: hasActualData
                            ? { fileKeys: currentFileKeys, texts: currentTexts }
                            : undefined,
                        nodeId: node.id,
                    });
                }

                // 获取 label 和 comment
                const label = nodeData.label as string | undefined;
                const comment = nodeData.comment as string | undefined;

                return {
                    dataNode: {
                        id: node.id,
                        type: nodeType,
                        dataType: dataTypeInfo.dataType,
                        label,
                        comment,
                        isInput,
                        inputName: isInput ? inputName : undefined,
                        staticData: hasActualData
                            ? { fileKeys: currentFileKeys, texts: currentTexts }
                            : undefined,
                        level,
                    },
                };
            }
        }

        // AI 生成模式，作为可执行节点处理
        const mapping = getEffectiveNodeConfig(nodeType, nodeData);
        if (!mapping) {
            console.warn(
                `[WorkflowExporter] Unknown add node type: ${nodeType}`,
            );
            return {};
        }

        const execNode = this.buildExecutableNode(
            node,
            mapping,
            level,
            nodeData,
        );
        return { executableNode: execNode };
    }

    /**
     * 获取 Add 节点对应的输出类型
     */
    private getAddNodeOutputType(nodeType: string): string {
        const typeMap: Record<string, string> = {
            addImageNode: "imageNode",
            addVideoNode: "videoNode",
            addAudioNode: "audioNode",
            addTextNode: "textNode",
            addModelNode: "modelNode",
            addFileNode: "fileNode",
            addLinkNode: "textNode",
        };
        return typeMap[nodeType] ?? "textNode";
    }

    /**
     * 查找执行节点直连的下游数据节点
     * 遍历所有从该节点出发的边，找到第一个数据节点类型的目标
     */
    private findDownstreamDataNode(nodeId: string): string | undefined {
        for (const edge of this.edges) {
            if (edge.source === nodeId) {
                const targetNode = this.nodes.find((n) => n.id === edge.target);
                if (targetNode && isDataNode(targetNode.type ?? "")) {
                    return targetNode.id;
                }
            }
        }
        return undefined;
    }

    /**
     * 处理可执行节点
     */
    private processExecutableNode(
        node: Node,
        level: number,
    ): ExecutableNode | null {
        const nodeType = node.type ?? "unknown";
        const nodeData = (node.data as Record<string, unknown>) ?? {};

        // 查找节点类型映射（优先从 node.data，fallback 到注册表）
        const mapping = getEffectiveNodeConfig(nodeType, nodeData);
        if (!mapping) {
            console.warn(
                `[WorkflowExporter] Unknown node type: ${nodeType}, skipping...`,
            );
            return null;
        }

        return this.buildExecutableNode(node, mapping, level, nodeData);
    }

    /**
     * 构建可执行节点
     */
    private buildExecutableNode(
        node: Node,
        mapping: NodeExecutionConfig,
        level: number,
        nodeData: Record<string, unknown>,
    ): ExecutableNode {
        const nodeType = node.type ?? "unknown";
        const upstreamNodes = getUpstreamNodeData(
            node.id,
            this.nodes,
            this.edges,
        );

        // 对于 Compose 节点，使用 ids 数组
        const ids = nodeData.ids as string[] | undefined;

        // 构建输入参数映射
        const inputMapping: Record<string, ParamMapping> = {};

        for (const [paramName, paramConfig] of Object.entries(
            mapping.paramMappings ?? {},
        )) {
            const paramMapping = this.resolveParamMapping(
                paramName,
                paramConfig,
                nodeData,
                upstreamNodes,
                ids,
            );
            inputMapping[paramName] = paramMapping;
        }

        // 获取依赖节点
        const dependencies = upstreamNodes.map((u) => u.node.id);

        // 获取 label 和 comment
        const label = mapping.label ?? (nodeData.label as string | undefined);
        const comment = nodeData.comment as string | undefined;
        const locked = nodeData.locked as boolean | undefined;

        // 找到直连的下游数据节点
        const downstreamDataNodeId = this.findDownstreamDataNode(node.id);

        return {
            id: node.id,
            type: nodeType,
            feature: (nodeData.feature as string) ?? mapping.feature,
            label,
            comment,
            locked,
            inputMapping,
            outputType: mapping.outputType ?? "file",
            outputField: mapping.outputField ?? "fileKeys",
            isBatch: mapping.supportsBatch,
            batchParam: mapping.batchParam,
            dependencies,
            level,
            downstreamDataNodeId,
            rawConfig: this.extractRawConfig(nodeData),
        };
    }

    /**
     * 解析参数映射
     */
    private resolveParamMapping(
        paramName: string,
        paramConfig: ParamMappingConfig,
        nodeData: Record<string, unknown>,
        upstreamNodes: {
            node: Node;
            edgeSourceHandle?: string;
            edgeTargetHandle?: string;
        }[],
        ids?: string[],
    ): ParamMapping {
        for (const sourceConfig of paramConfig.sources) {
            switch (sourceConfig.type) {
                case "config": {
                    const value = getValueFromPath(
                        nodeData,
                        sourceConfig.configPath!,
                    );
                    if (value !== undefined && value !== null && value !== "") {
                        return {
                            source: "static",
                            value,
                        };
                    }
                    break;
                }

                case "upstream": {
                    // 查找匹配类型的上游节点
                    let upstreamNode: Node | undefined;
                    let arrayIndex: number | undefined;

                    if (ids && ids.length > 0) {
                        // Compose 节点：从 ids 中按类型查找
                        const matchingNodes = this.nodes.filter(
                            (n) =>
                                ids.includes(n.id) &&
                                n.type === sourceConfig.upstreamType,
                        );

                        // collectAll 模式：收集所有匹配节点的数据
                        if (
                            sourceConfig.collectAll &&
                            matchingNodes.length > 0
                        ) {
                            return {
                                source: "upstream",
                                nodeIds: matchingNodes.map((n) => n.id),
                                field: sourceConfig.upstreamField,
                                transform: sourceConfig.needsUrlTransform
                                    ? "getR2Url"
                                    : undefined,
                            };
                        }

                        // 如果有多个同类型节点，需要确定使用哪个
                        // 对于首尾帧等场景，根据参数名判断
                        if (matchingNodes.length > 1) {
                            if (
                                paramName.includes("start") ||
                                paramName.includes("first")
                            ) {
                                upstreamNode = matchingNodes[0];
                                arrayIndex = 0;
                            } else if (
                                paramName.includes("end") ||
                                paramName.includes("second")
                            ) {
                                upstreamNode = matchingNodes[1];
                                arrayIndex = 1;
                            } else {
                                upstreamNode = matchingNodes[0];
                            }
                        } else {
                            upstreamNode = matchingNodes[0];
                        }
                    } else {
                        // Transfer 节点：从边关系中查找（支持 targetHandle 区分多槽位）
                        const upstream = upstreamNodes.find((u) => {
                            if (u.node.type !== sourceConfig.upstreamType) {
                                return false;
                            }
                            if (sourceConfig.targetHandle) {
                                return (
                                    normalizeEdgeTargetHandle(
                                        u.edgeTargetHandle,
                                    ) === sourceConfig.targetHandle
                                );
                            }
                            return true;
                        });
                        upstreamNode = upstream?.node;
                    }

                    if (upstreamNode) {
                        return {
                            source: "upstream",
                            nodeId: upstreamNode.id,
                            field: sourceConfig.upstreamField,
                            transform: sourceConfig.needsUrlTransform
                                ? "getR2Url"
                                : undefined,
                            arrayIndex,
                            edgeTargetHandle: sourceConfig.targetHandle,
                        };
                    }
                    break;
                }

                case "static": {
                    if (sourceConfig.defaultValue !== undefined) {
                        return {
                            source: "static",
                            value: sourceConfig.defaultValue,
                        };
                    }
                    break;
                }

                case "input": {
                    return {
                        source: "input",
                        inputName: sourceConfig.inputName,
                    };
                }
            }
        }

        // 默认返回静态空值
        return {
            source: "static",
            value: paramConfig.required ? undefined : "",
        };
    }

    /**
     * 提取原始配置（用于 UI 恢复）
     */
    private extractRawConfig(
        nodeData: Record<string, unknown>,
    ): Record<string, unknown> {
        // 排除一些不需要保存的字段
        const excludeFields = [
            "feature",
            "prompt",
            "outputType",
            "outputField",
            "ids",
        ];
        const config: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(nodeData)) {
            if (!excludeFields.includes(key)) {
                config[key] = value;
            }
        }

        return config;
    }
}

/* ========================================================================== */
/* 便捷导出函数                                                                */
/* ========================================================================== */

/**
 * 导出工作流为可执行 JSON
 */
export function exportWorkflow(
    nodes: Node[],
    edges: Edge[],
    options: ExportOptions = {},
): ExecutableWorkflow {
    const exporter = new WorkflowExporter(nodes, edges);
    return exporter.export(options);
}

/**
 * 将可执行工作流转换为 JSON 字符串
 */
export function stringifyExecutableWorkflow(
    workflow: ExecutableWorkflow,
    pretty: boolean = true,
): string {
    return JSON.stringify(workflow, null, pretty ? 2 : 0);
}

/**
 * 从 JSON 字符串解析可执行工作流
 */
export function parseExecutableWorkflow(json: string): ExecutableWorkflow {
    return JSON.parse(json) as ExecutableWorkflow;
}

/** 导入 JSON 中缺少画布数据（originalFlow / flow / nodes+edges） */
export const WORKFLOW_IMPORT_NO_CANVAS = "WORKFLOW_IMPORT_NO_CANVAS";

export interface ParsedWorkflowImport {
    nodes: Node[];
    edges: Edge[];
    name?: string;
    description?: string;
}

function unwrapJsonValue(raw: unknown): unknown {
    let v = raw;
    if (typeof v === "string") {
        try {
            v = JSON.parse(v);
        } catch {
            return raw;
        }
        if (typeof v === "string") {
            try {
                v = JSON.parse(v);
            } catch {
                return v;
            }
        }
    }
    return v;
}

/**
 * 从用户上传或粘贴的 JSON 解析出画布 nodes/edges。
 * 支持：ExecutableWorkflow（含 originalFlow）、{ flow: { nodes, edges } }、根级 { nodes, edges }。
 */
export function parseWorkflowImportJson(raw: unknown): ParsedWorkflowImport {
    const data = unwrapJsonValue(raw);
    if (!data || typeof data !== "object") {
        throw new Error("WORKFLOW_IMPORT_INVALID_JSON");
    }
    const obj = data as Record<string, unknown>;

    let flowObj: Record<string, unknown> | null = null;

    if (obj.originalFlow && typeof obj.originalFlow === "object") {
        flowObj = obj.originalFlow as Record<string, unknown>;
    } else if (obj.flow !== undefined) {
        const f = unwrapJsonValue(obj.flow);
        if (f && typeof f === "object") {
            flowObj = f as Record<string, unknown>;
        }
    } else if (Array.isArray(obj.nodes) || Array.isArray(obj.edges)) {
        flowObj = obj;
    }

    if (!flowObj) {
        throw new Error(WORKFLOW_IMPORT_NO_CANVAS);
    }

    const nodes = flowObj.nodes;
    const edges = flowObj.edges;
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        throw new Error(WORKFLOW_IMPORT_NO_CANVAS);
    }

    return {
        nodes: nodes as Node[],
        edges: edges as Edge[],
        name: typeof obj.name === "string" ? obj.name : undefined,
        description:
            typeof obj.description === "string" ? obj.description : undefined,
    };
}
