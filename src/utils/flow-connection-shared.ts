/**
 * Shared helpers for RF connection validation (`connection-rules.ts`,
 * `connection-validator.ts`).
 */

import { DATA_NODE_TYPES } from "@/utils/executable-workflow";
import {
    getNodeExecutionConfig,
    type NodeExecutionConfig,
    type ParamMappingConfig,
} from "@/utils/node-execution-config";

/** Add node type → logical output type (consistent with workflow-exporter). */
export const ADD_NODE_OUTPUT_TYPE: Record<string, string> = {
    addImageNode: "imageNode",
    addVideoNode: "videoNode",
    addAudioNode: "audioNode",
    addTextNode: "textNode",
    addModelNode: "modelNode",
    addFileNode: "fileNode",
    addLinkNode: "textNode",
};

/** Normalized RF target handle (`undefined`/null behave like default inlet `"a"`). */
export function normalizeFlowTargetHandle(
    id: string | null | undefined,
): string {
    return id ?? "a";
}

export function getNodeConfigFromData(
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
        abiProducerPropertyCandidates: Array.isArray(
            nodeData.abiProducerPropertyCandidates,
        )
            ? (nodeData.abiProducerPropertyCandidates as readonly string[])
            : undefined,
        paramMappings,
        supportsBatch: nodeData.supportsBatch as boolean | undefined,
        batchParam: nodeData.batchParam as string | undefined,
        label: nodeData.label as string | undefined,
    };
}

export function getEffectiveNodeConfig(
    nodeType: string,
    nodeData: Record<string, unknown>,
): NodeExecutionConfig | undefined {
    return getNodeExecutionConfig(nodeType) ?? getNodeConfigFromData(nodeData);
}

/** Logical upstream output RF type (“textNode”, “imageNode”, …). */
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
