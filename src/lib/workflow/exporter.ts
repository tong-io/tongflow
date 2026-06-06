/**
 * Workflow exporter
 * Converts a ReactFlow workflow to an executable workflow JSON
 */

import type { Edge, Node } from "@xyflow/react";
import type { NodeSlot } from "@/generated/abi";
import {
    parseSourceHandleId,
    targetHandleId,
} from "@/lib/abi/handle-introspect";
import {
    type AbiNodeRegistration,
    getAbiNodeRegistration,
} from "@/lib/abi/node-registry";
import { type ResolvedSpec, resolveSpec } from "@/lib/abi/resolve";
import type { FieldSourceOverride } from "@/lib/abi/sources";
import { logger } from "@/lib/logger";
import { getAbiOutputRoutesBySlot } from "@/lib/schema/tongflow-abi";
import {
    DATA_NODE_TYPES,
    type DataNode,
    type ExecutableNode,
    type ExecutableWorkflow,
    type FieldBinding,
    type OutputRoute,
    type WorkflowInput,
    type WorkflowOutput,
} from "./executable-workflow";
import { WorkflowParser } from "./parser";

/**
 * Resolve a node's ABI spec from the mount registry. Returns the registration +
 * resolved spec, or undefined if the node isn't ABI-registered.
 */
function getNodeSpec(
    nodeId: string,
): { reg: AbiNodeRegistration; spec: ResolvedSpec } | undefined {
    const reg = getAbiNodeRegistration(nodeId);
    if (!reg) return undefined;
    const spec = resolveSpec(
        reg.feature as NodeSlot,
        reg.sourceSpec as Record<string, FieldSourceOverride> | undefined,
    );
    return { reg, spec };
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
    return incomingEdges.flatMap((edge) => {
        const node = nodes.find((n) => n.id === edge.source);
        if (!node) return [];
        return [
            {
                node,
                edgeSourceHandle: edge.sourceHandle ?? undefined,
                edgeTargetHandle: edge.targetHandle ?? undefined,
            },
        ];
    });
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
                // Output of executable nodes — pick the primary ABI route.
                const ns = getNodeSpec(nodeId);
                if (ns) {
                    const routes = getAbiOutputRoutesBySlot(ns.reg.feature);
                    const primary =
                        routes.find((r) => !r.expandEach) ?? routes[0];
                    if (primary) {
                        const semType: WorkflowOutput["type"] =
                            primary.nodeType === "textNode"
                                ? "text"
                                : (primary.nodeType.replace(
                                      "Node",
                                      "",
                                  ) as WorkflowOutput["type"]);
                        outputs.push({
                            name: `output_${nodeId.substring(0, 8)}`,
                            type: semType,
                            nodeId,
                            field: primary.dataField,
                        });
                    }
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
        const ns = getNodeSpec(node.id);
        if (!ns) {
            logger.warn(
                `[WorkflowExporter] Unknown add node type: ${nodeType}`,
            );
            return {};
        }

        const execNode = this.buildExecutableNode(node, ns, level, nodeData);
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
     * (single-channel fallback used by Add nodes). Returns the first target
     * that is a data node type.
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
     * Multi-channel variant: for each outgoing edge to a data node, return the
     * mapping `ABI sourceField → dataNodeId`, derived from the edge's
     * `sourceHandle` (`out:<field>`). Edges without a sourceHandle are
     * attributed to the route slot determined by the data node's nodeType
     * (`textNode` → first text route, `imageNode` → first image route, etc.).
     */
    private findDownstreamDataNodes(
        nodeId: string,
        routes: OutputRoute[],
    ): Map<string, string> {
        const out = new Map<string, string>();
        const routeByField = new Map(routes.map((r) => [r.sourceField, r]));
        const firstRouteByNodeType = new Map<string, OutputRoute>();
        for (const r of routes) {
            if (!firstRouteByNodeType.has(r.nodeType)) {
                firstRouteByNodeType.set(r.nodeType, r);
            }
        }

        for (const edge of this.edges) {
            if (edge.source !== nodeId) continue;
            const targetNode = this.nodes.find((n) => n.id === edge.target);
            if (!targetNode) continue;
            const targetType = targetNode.type ?? "";
            if (!isDataNode(targetType)) continue;

            // Prefer the explicit sourceHandle (`out:<field>`).
            const handleField = parseSourceHandleId(edge.sourceHandle);
            if (handleField && routeByField.has(handleField)) {
                if (!out.has(handleField)) out.set(handleField, targetNode.id);
                continue;
            }

            // Fall back to the first route whose nodeType matches the data node's type.
            const fallback = firstRouteByNodeType.get(targetType);
            if (fallback && !out.has(fallback.sourceField)) {
                out.set(fallback.sourceField, targetNode.id);
            }
        }
        return out;
    }

    /**
     * Process an executable node
     */
    private processExecutableNode(
        node: Node,
        level: number,
    ): ExecutableNode | null {
        const ns = getNodeSpec(node.id);
        if (!ns) {
            logger.warn(
                `[WorkflowExporter] Unknown node type: ${node.type}, skipping...`,
            );
            return null;
        }
        const nodeData = (node.data as Record<string, unknown>) ?? {};
        return this.buildExecutableNode(node, ns, level, nodeData);
    }

    /**
     * Build an executable node from an ABI registration + resolved spec.
     */
    private buildExecutableNode(
        node: Node,
        ns: { reg: AbiNodeRegistration; spec: ResolvedSpec },
        level: number,
        nodeData: Record<string, unknown>,
    ): ExecutableNode {
        const nodeType = node.type ?? "unknown";
        const upstreamNodes = getUpstreamNodeData(
            node.id,
            this.nodes,
            this.edges,
        );

        const bindings = this.buildBindings(ns.spec, upstreamNodes, nodeData);

        const dependencies = Array.from(
            new Set(upstreamNodes.map((u) => u.node.id)),
        );

        const label = ns.reg.label ?? (nodeData.label as string | undefined);
        const comment = nodeData.comment as string | undefined;
        const locked = nodeData.locked as boolean | undefined;

        const baseRoutes = getAbiOutputRoutesBySlot(ns.reg.feature);
        const downstreamMap = this.findDownstreamDataNodes(node.id, baseRoutes);
        const outputRoutes: OutputRoute[] = baseRoutes.map((r) => ({
            sourceField: r.sourceField,
            nodeType: r.nodeType,
            dataField: r.dataField,
            expandEach: r.expandEach,
            ...(r.itemValuePath ? { itemValuePath: r.itemValuePath } : {}),
            ...(r.isArrayOfArrays
                ? { isArrayOfArrays: r.isArrayOfArrays }
                : {}),
            ...(downstreamMap.get(r.sourceField)
                ? {
                      downstreamDataNodeId: downstreamMap.get(
                          r.sourceField,
                      ) as string,
                  }
                : {}),
        }));

        const pluginId =
            typeof nodeData.pluginId === "string"
                ? nodeData.pluginId.trim()
                : "";

        return {
            id: node.id,
            type: nodeType,
            feature: ns.reg.feature,
            pluginId,
            label,
            comment,
            locked,
            bindings,
            batchField: ns.spec.batchField,
            outputs: outputRoutes,
            dependencies,
            level,
            rawConfig: this.extractRawConfig(nodeData),
        };
    }

    /**
     * Build per-field bindings for an executable node by walking its resolved
     * ABI spec. Handle fields are wired to upstream edges via targetHandle.
     *
     * `fromField` semantics:
     *  - upstream is a data node → canvas-side dataField (`texts` / `fileKeys`).
     *  - upstream is an executable → the upstream's ABI output source field
     *    whose route nodeType matches this consumer's nodeType. The workflow
     *    runner reads the upstream's projected `AbiOutputView` by this key.
     */
    private buildBindings(
        spec: ResolvedSpec,
        upstreamNodes: {
            node: Node;
            edgeSourceHandle?: string;
            edgeTargetHandle?: string;
        }[],
        nodeData: Record<string, unknown>,
    ): Record<string, FieldBinding> {
        const out: Record<string, FieldBinding> = {};

        for (const [field, fSpec] of Object.entries(spec.fields)) {
            switch (fSpec.kind) {
                case "handle": {
                    const handleId = targetHandleId(field);
                    const matches = upstreamNodes.filter(
                        (u) => u.edgeTargetHandle === handleId,
                    );
                    if (matches.length === 0) {
                        // Widget ⇄ input duality: nothing connected, so fall back
                        // to the manual config value if this field allows it.
                        if (fSpec.manual) {
                            const value = getValueFromPath(nodeData, field);
                            if (
                                value !== undefined &&
                                value !== null &&
                                value !== ""
                            ) {
                                out[field] = { kind: "config", value };
                            }
                        }
                        break;
                    }
                    // `consumerShape` describes the per-call plugin shape.
                    //  - intrinsic ABI array OR `collectAll` → "array".
                    //  - `batchOn` does NOT force "array": each batch iteration
                    //    consumes a single scalar value on the plugin side
                    //    (the runner handles fan-out separately).
                    const consumerShape: "scalar" | "array" =
                        fSpec.array || fSpec.collect ? "array" : "scalar";
                    out[field] = {
                        kind: "handle",
                        sources: matches.map((u) =>
                            this.resolveBindingSource(
                                u.node,
                                u.edgeSourceHandle,
                                fSpec.nodeType,
                            ),
                        ),
                        targetHandle: handleId,
                        consumerShape,
                    };
                    break;
                }
                case "config": {
                    const value = getValueFromPath(nodeData, field);
                    if (value !== undefined && value !== null && value !== "") {
                        out[field] = { kind: "config", value };
                    }
                    break;
                }
                case "static": {
                    out[field] = { kind: "static", value: fSpec.value };
                    break;
                }
                case "input": {
                    out[field] = {
                        kind: "input",
                        inputName: fSpec.inputName ?? field,
                    };
                    break;
                }
            }
        }

        return out;
    }

    /**
     * Pick the right `fromField` for a binding source:
     *  - upstream is a data node → dataField (`texts` / `fileKeys`) from DATA_NODE_TYPES.
     *  - upstream is an executable / Add executable → ABI sourceField via the
     *    upstream's output routes; prefer the route whose nodeType matches the
     *    consumer's expected nodeType (so multi-channel sources route correctly).
     *  - Add data node not yet registered → fall back to its dataField via the
     *    Add-node-type mapping.
     */
    private resolveBindingSource(
        upstream: Node,
        edgeSourceHandle: string | undefined,
        consumerNodeType: string,
    ): { fromNodeId: string; fromField: string } {
        const upstreamType = upstream.type ?? "";

        if (isDataNode(upstreamType)) {
            const info = DATA_NODE_TYPES[upstreamType];
            return { fromNodeId: upstream.id, fromField: info.outputField };
        }

        if (isAddNode(upstreamType)) {
            const reg = getAbiNodeRegistration(upstream.id);
            if (!reg) {
                // Add node acting as a data node (upload / manual input mode).
                const outNodeType = this.getAddNodeOutputType(upstreamType);
                const info = DATA_NODE_TYPES[outNodeType];
                return {
                    fromNodeId: upstream.id,
                    fromField: info?.outputField ?? "texts",
                };
            }
            // Add node acting as an executable (AI mode): use ABI route.
            return this.pickExecutableSourceField(
                upstream.id,
                reg.feature,
                edgeSourceHandle,
                consumerNodeType,
            );
        }

        const reg = getAbiNodeRegistration(upstream.id);
        if (reg) {
            return this.pickExecutableSourceField(
                upstream.id,
                reg.feature,
                edgeSourceHandle,
                consumerNodeType,
            );
        }

        // Fallback: assume the upstream behaves like a same-type data node.
        const info = DATA_NODE_TYPES[upstreamType];
        return {
            fromNodeId: upstream.id,
            fromField: info?.outputField ?? "texts",
        };
    }

    private pickExecutableSourceField(
        nodeId: string,
        feature: string,
        edgeSourceHandle: string | undefined,
        consumerNodeType: string,
    ): { fromNodeId: string; fromField: string } {
        const routes = getAbiOutputRoutesBySlot(feature);
        // Prefer explicit `out:<field>` sourceHandle, when valid.
        const handleField = parseSourceHandleId(edgeSourceHandle);
        if (handleField && routes.some((r) => r.sourceField === handleField)) {
            return { fromNodeId: nodeId, fromField: handleField };
        }
        // Match by consumer's nodeType to disambiguate multi-channel outputs.
        const byType = routes.find((r) => r.nodeType === consumerNodeType);
        if (byType) {
            return { fromNodeId: nodeId, fromField: byType.sourceField };
        }
        // Last resort: first route (preserves single-channel pre-multi-channel
        // workflows where the consumer's nodeType happens to differ).
        if (routes[0]) {
            return { fromNodeId: nodeId, fromField: routes[0].sourceField };
        }
        return { fromNodeId: nodeId, fromField: "" };
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
        nodes: nodes as Node[],
        edges: edges as Edge[],
        name: typeof obj.name === "string" ? obj.name : undefined,
        description:
            typeof obj.description === "string" ? obj.description : undefined,
    };
}
