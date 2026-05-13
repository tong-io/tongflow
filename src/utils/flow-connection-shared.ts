/**
 * Shared helpers for RF connection validation (`connection-rules.ts`,
 * `connection-validator.ts`).
 */

import { getAbiNodeRegistration } from "@/lib/abi/node-registry";
import { deriveOutputType, resolveSpec } from "@/lib/abi/resolve";
import type { FieldSourceOverride } from "@/lib/abi/sources";
import { DATA_NODE_TYPES } from "@/utils/executable-workflow";

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

/**
 * Logical upstream output RF type (“textNode”, “imageNode”, …).
 *
 * - data node → itself
 * - ABI node → if `sourceHandle = out:<field>` resolves to a specific output
 *   route, returns that route's modality. Otherwise falls back to the primary
 *   output (`deriveOutputType`).
 * - add node → fixed mapping
 */
export function getEffectiveOutputType(
    nodeId: string,
    nodeType: string | undefined,
    sourceHandle?: string | null,
): string | undefined {
    if (!nodeType) return undefined;
    if (nodeType in DATA_NODE_TYPES) return nodeType;

    const reg = getAbiNodeRegistration(nodeId);
    if (reg) {
        const spec = resolveSpec(
            reg.feature,
            reg.sourceSpec as Record<string, FieldSourceOverride> | undefined,
        );

        if (sourceHandle?.startsWith("out:")) {
            const field = sourceHandle.slice("out:".length);
            const match = spec.topology.outputs.find((o) => o.field === field);
            if (match) return match.nodeType;
        }

        const { outputType } = deriveOutputType(spec);
        if (outputType) return outputType;
    }

    return ADD_NODE_OUTPUT_TYPE[nodeType];
}

/**
 * ABI-derived output field ("texts" / "fileKeys") for a node, or undefined
 * if the node isn't ABI-registered.
 */
export function getEffectiveOutputField(
    nodeId: string,
): "texts" | "fileKeys" | undefined {
    const reg = getAbiNodeRegistration(nodeId);
    if (!reg) return undefined;
    const spec = resolveSpec(
        reg.feature,
        reg.sourceSpec as Record<string, FieldSourceOverride> | undefined,
    );
    return deriveOutputType(spec).outputField;
}
