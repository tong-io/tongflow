// src/constants/modality-nodes.ts

export const MODALITY_NODE_TYPES = [
    "imageNode",
    "textNode",
    "videoNode",
    "audioNode",
    "fileNode",
    "modelNode",
] as const;

export type ModalityNodeType = (typeof MODALITY_NODE_TYPES)[number];

export const isModalityNode = (type?: string): boolean => {
    return !!type && MODALITY_NODE_TYPES.includes(type as ModalityNodeType);
};
