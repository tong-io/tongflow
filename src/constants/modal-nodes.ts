// src/constants/modal-nodes.ts

export const MODAL_NODE_TYPES = [
    "imageNode",
    "textNode",
    "videoNode",
    "audioNode",
    "fileNode",
    "modelNode",
] as const;

export type ModalNodeType = (typeof MODAL_NODE_TYPES)[number];

export const isModalNode = (type?: string): boolean => {
    return !!type && MODAL_NODE_TYPES.includes(type as ModalNodeType);
};
