/**
 * Workflow exporter
 * Converts a ReactFlow workflow to an executable workflow JSON
 */

import type { Edge, Node } from "@xyflow/react";
import { logger } from "@/lib/logger";
import { migrateWorkflowNodes } from "@/utils/migrate-workflow-nodes";
import {
    DATA_NODE_TYPES,
    type DataNode,
    type ExecutableNode,
    type ExecutableWorkflow,
    type ParamMapping,
    type WorkflowInput,
    type WorkflowOutput,
} from "./executable-workflow";
import {
    getNodeExecutionConfig,
    type NodeExecutionConfig,
    type ParamMappingConfig,
} from "./node-execution-config";
import { WorkflowParser } from "./workflow-parser";

/**
 * Build a NodeExecutionConfig from node.data
 * The config in node.data is preferred so the backend does not need to rely on the front-end runtime registry
 * A config is returned only when both feature and paramMappings are present in node.data
 */
function getNodeConfigFromData(
    nodeData: Record<string, unknown>,
): NodeExecutionConfig | undefined {
    const feature = nodeData.feature as string | undefined;
    const paramMappings = nodeData.paramMappings as
        | Record<string, ParamMappingConfig>
        | undefined;

    // Both feature and paramMappings must be present for the config to be considered complete
    // Otherwise fall back to the registry for the full config
    if (!feature || !paramMappings) return undefined;

    return {
        nodeType: "", // Not needed by the backend
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
 * Get the node execution configuration (prefers the latest config from the registry; falls back to node.data)
 */
function getEffectiveNodeConfig(
    nodeType: string,
    nodeData: Record<string, unknown>,
): NodeExecutionConfig | undefined {
    // Prefer the latest config from the runtime registry (front-end scenario)
    const registryConfig = getNodeExecutionConfig(nodeType);
    if (registryConfig) return registryConfig;

    // Fall back to node.data (back-end scenario or unregistered nodes)
    return getNodeConfigFromData(nodeData);
}

/* ========================================================================== */
/* Utility functions                                                            */
/* ========================================================================== */

/**
 * Get a value from a config path
 */
function getValueFromPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }

        // Handle array index, e.g. "fileKeys[0]"
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
 * Check whether a node is a data node (no execution needed; provides data only)
 */
function isDataNode(nodeType: string): boolean {
    return nodeType in DATA_NODE_TYPES;
}

/**
 * Check whether a node is an Add node (may have uploaded data or AI generation)
 */
function isAddNode(nodeType: string): boolean {
    return nodeType.startsWith("add");
}

/**
 * Get upstream node data
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
 * Get an upstream node from the ids array by node type
 */
function _getUpstreamNodeByType(
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
/* Main exporter class                                                          */
/* ========================================================================== */

export interface ExportOptions {
    /** Workflow name */
    name?: string;
    /** Workflow description */
    description?: string;
    /** Whether to include the original flow data */
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
     * Export as an executable workflow
     */
    export(options: ExportOptions = {}): ExecutableWorkflow {
        const plan = this.parser.generateExecutionPlan();

        const dataNodes: DataNode[] = [];
        const executableNodes: ExecutableNode[] = [];
        const inputs: WorkflowInput[] = [];
        const outputs: WorkflowOutput[] = [];

        // Process nodes by level
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
                const _nodeData = (node.data as Record<string, unknown>) ?? {};

                // Process data node
                if (isDataNode(nodeType)) {
                    const dataNodeInfo = this.processDataNode(
                        node,
                        levelIndex,
                        inputs,
                    );
                    dataNodes.push(dataNodeInfo);
                    continue;
                }

                // Process Add node
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

                // Process executable node
                const execNode = this.processExecutableNode(node, levelIndex);
                if (execNode) {
                    executableNodes.push(execNode);
                }
            }
        }

        // Process output nodes (nodes with out-degree 0)
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
                // Output of executable nodes
                const nodeData = (node.data as Record<string, unknown>) ?? {};
                const mapping = getEffectiveNodeConfig(nodeType, nodeData);
                if (mapping?.outputType) {
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

        // Filter executionLevels to keep only executable nodes
        const executableNodeIds = new Set(executableNodes.map((n) => n.id));
        const filteredLevels = plan.levels
            .map((level) =>
                level.filter((nodeId) => executableNodeIds.has(nodeId)),
            )
            .filter((level) => level.length > 0); // Remove empty levels

        // Extract edge relationships between data nodes (used for input pass-through)
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
     * Process a data node
     */
    private processDataNode(
        node: Node,
        level: number,
        inputs: WorkflowInput[],
    ): DataNode {
        const nodeType = node.type ?? "unknown";
        const nodeData = (node.data as Record<string, unknown>) ?? {};
        const dataTypeInfo = DATA_NODE_TYPES[nodeType];

        // Check for static data
        const fileKeys = nodeData.fileKeys as string[] | undefined;
        const texts = nodeData.texts as string[] | undefined;
        const hasStaticData =
            (fileKeys && fileKeys.length > 0) || (texts && texts.length > 0);

        // If this is a start node without static data, create an input definition
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

        // Get label and comment
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
     * Process an Add node
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

        // Determine upload mode (no execution needed; provides data only)
        // - upload/draw/canvas/lib/library/camera/record mode: user uploads, selects, or records files
        // - activeTab is undefined: node is not yet configured; treated as a data node by default
        // - manual mode (manualValue present): user manually enters text; treated as a data node
        const isUploadMode =
            activeTab === "upload" ||
            activeTab === "draw" ||
            activeTab === "canvas" || // addImageNode drawing mode
            activeTab === "lib" ||
            activeTab === "library" || // addAudioNode portfolio mode
            activeTab === "camera" ||
            activeTab === "record" ||
            activeTab === undefined;
        // addTextNode manual input mode: manualValue is present and there is no feature
        const isManualTextMode =
            nodeType === "addTextNode" &&
            manualValue !== undefined &&
            manualValue !== "";
        const fileKeys = nodeData.fileKeys as string[] | undefined;
        const texts = nodeData.texts as string[] | undefined;
        // For manual input mode, use manualValue as the texts data
        const effectiveTexts =
            isManualTextMode && (!texts || texts.length === 0)
                ? [manualValue]
                : texts;
        const hasStaticData =
            (fileKeys && fileKeys.length > 0) ||
            (effectiveTexts && effectiveTexts.length > 0);

        // AI mode or has a feature; treat as an executable node
        const hasFeature = !!feature && feature.length > 0;

        // If the node itself has no static data, try to get it from the directly connected downstream DataNode (pass-through scenario)
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

        // If in upload mode or manual input mode and no feature, treat as a data node
        // If in AI mode or has a feature, treat as an executable node
        if ((isUploadMode || isManualTextMode) && !hasFeature) {
            const outputType = this.getAddNodeOutputType(nodeType);
            const dataTypeInfo = DATA_NODE_TYPES[outputType];

            if (dataTypeInfo) {
                // Add nodes at level=0 are always marked as isInput, even if they have static data
                // This allows the App side to override static data (e.g. user takes a photo or uploads their own image)
                const isStartNode = level === 0;
                const isInput = isStartNode; // Add nodes at level=0 are always input nodes
                const inputName = `input_${node.id.substring(0, 8)}`;

                if (isInput) {
                    inputs.push({
                        name: inputName,
                        type:
                            dataTypeInfo.outputField === "texts"
                                ? "text[]"
                                : "file[]",
                        description: `Input data for ${nodeType}`,
                        required: !hasStaticData, // If the node itself has no fixed data, mark as required to prompt the user in the UI
                        defaultValue: hasActualData
                            ? { fileKeys: currentFileKeys, texts: currentTexts }
                            : undefined,
                        nodeId: node.id,
                    });
                }

                // Get label and comment
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

        // AI generation mode; treat as an executable node
        const mapping = getEffectiveNodeConfig(nodeType, nodeData);
        if (!mapping) {
            logger.warn(
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
     * Get the output type corresponding to an Add node
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
     * Find the downstream data node directly connected to an executable node
     * Traverses all edges from the node and returns the first target that is a data node type
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
     * Process an executable node
     */
    private processExecutableNode(
        node: Node,
        level: number,
    ): ExecutableNode | null {
        const nodeType = node.type ?? "unknown";
        const nodeData = (node.data as Record<string, unknown>) ?? {};

        // Look up the node type mapping (prefer node.data; fall back to the registry)
        const mapping = getEffectiveNodeConfig(nodeType, nodeData);
        if (!mapping) {
            logger.warn(
                `[WorkflowExporter] Unknown node type: ${nodeType}, skipping...`,
            );
            return null;
        }

        return this.buildExecutableNode(node, mapping, level, nodeData);
    }

    /**
     * Build an executable node
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

        // For Compose nodes, use the ids array
        const ids = nodeData.ids as string[] | undefined;

        // Build the input parameter mapping
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

        // Get dependency nodes
        const dependencies = upstreamNodes.map((u) => u.node.id);

        // Get label and comment
        const label = mapping.label ?? (nodeData.label as string | undefined);
        const comment = nodeData.comment as string | undefined;
        const locked = nodeData.locked as boolean | undefined;

        // Find the directly connected downstream data node
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
     * Resolve parameter mapping
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
                    // Find upstream nodes matching the type
                    let upstreamNode: Node | undefined;
                    let arrayIndex: number | undefined;

                    if (ids && ids.length > 0) {
                        // Compose node: find by type from the ids array
                        const matchingNodes = this.nodes.filter(
                            (n) =>
                                ids.includes(n.id) &&
                                n.type === sourceConfig.upstreamType,
                        );

                        // collectAll mode: collect data from all matching nodes
                        if (
                            sourceConfig.collectAll &&
                            matchingNodes.length > 0
                        ) {
                            return {
                                source: "upstream",
                                nodeIds: matchingNodes.map((n) => n.id),
                                field: sourceConfig.upstreamField,
                            };
                        }

                        // If there are multiple nodes of the same type, determine which one to use
                        // For scenarios like first/last frame, determine by parameter name
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
                        // Transfer node: find from edge relationships (supports targetHandle to distinguish multi-slot)
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

        // Default to a static empty value
        return {
            source: "static",
            value: paramConfig.required ? undefined : "",
        };
    }

    /**
     * Extract the raw configuration (used for UI restoration)
     */
    private extractRawConfig(
        nodeData: Record<string, unknown>,
    ): Record<string, unknown> {
        // Exclude fields that do not need to be saved
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
/* Convenience export functions                                                 */
/* ========================================================================== */

/**
 * Export a workflow as executable JSON
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
 * Serialize an executable workflow to a JSON string
 */
export function stringifyExecutableWorkflow(
    workflow: ExecutableWorkflow,
    pretty: boolean = true,
): string {
    return JSON.stringify(workflow, null, pretty ? 2 : 0);
}

/**
 * Parse an executable workflow from a JSON string
 */
export function parseExecutableWorkflow(json: string): ExecutableWorkflow {
    return JSON.parse(json) as ExecutableWorkflow;
}

/** The imported JSON is missing canvas data (originalFlow / flow / nodes+edges) */
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
 * Parse canvas nodes/edges from a JSON uploaded or pasted by the user.
 * Supports: ExecutableWorkflow (with originalFlow), { flow: { nodes, edges } }, and root-level { nodes, edges }.
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
        nodes: migrateWorkflowNodes(nodes as Node[]),
        edges: edges as Edge[],
        name: typeof obj.name === "string" ? obj.name : undefined,
        description:
            typeof obj.description === "string" ? obj.description : undefined,
    };
}
