/**
 * Node dimension estimation + shared layout gap constants.
 *
 * All canvas nodes are center-anchored (`origin [0.5, 0.5]`), so every gap
 * computation needs both endpoints' half-sizes. React Flow only fills
 * `node.measured` after the first DOM render — nodes created in the current
 * tick have none — and media nodes re-measure asynchronously once their
 * image/video loads. This table bridges those windows.
 *
 * Maintenance rule: static values are derived from each component's
 * `min-w-[…]` classNames and observed `measured` values on a live canvas.
 * They are layout HINTS, not a contract — a real `measured` always wins, and
 * the post-layout settle watcher corrects late re-measures. If a node
 * component's width class changes materially, update its row here.
 */

import type { Node } from "@xyflow/react";
import { NODE_TYPE_TO_ABI_FEATURE } from "../../abi/node-feature-registry";
import { MEDIA_NODE_REF_DISPLAY_WIDTH_PX } from "../../constants/media-node-max-width";

/** Edge-to-edge horizontal gap (spawn math and layout columns). */
export const H_GAP = 100;
/** Edge-to-edge vertical gap between siblings / within a layout column. */
export const V_GAP = 60;
/** Vertical gap inserted between disconnected components after de-overlap. */
export const COMPONENT_V_GAP = 160;

export interface NodeSize {
    w: number;
    h: number;
}

const MEDIA_NODE_SIZE: NodeSize = {
    w: MEDIA_NODE_REF_DISPLAY_WIDTH_PX,
    h: 304,
};

const NODE_SIZE_TABLE: Record<string, NodeSize> = {
    // Data / modality nodes
    textNode: { w: 256, h: 96 },
    linkNode: { w: 300, h: 160 },
    fileNode: { w: 160, h: 150 },
    modelNode: { w: 256, h: 260 },
    imageNode: MEDIA_NODE_SIZE,
    videoNode: MEDIA_NODE_SIZE,
    audioNode: { w: 360, h: 140 },
    // Add (input-widget) nodes
    addTextNode: { w: 480, h: 320 },
    addImageNode: { w: 480, h: 320 },
    addVideoNode: { w: 480, h: 320 },
    addAudioNode: { w: 480, h: 320 },
    addModelNode: { w: 480, h: 320 },
    addLinkNode: { w: 480, h: 320 },
    addFileNode: { w: 360, h: 320 },
    // Executable nodes that differ notably from the 480×400 default
    imageFusionNode: { w: 480, h: 780 },
    refsGenVideoNode: { w: 480, h: 780 },
    textGenMusicNode: { w: 520, h: 480 },
    textGenAudioNode: { w: 480, h: 480 },
    musicExtractNode: { w: 420, h: 400 },
};

const DEFAULT_EXECUTABLE_SIZE: NodeSize = { w: 480, h: 400 };
const DEFAULT_SIZE: NodeSize = { w: 256, h: 80 };

type SizableNode = Pick<Node, "type"> & {
    measured?: { width?: number; height?: number };
};

export function estimateNodeSize(node: SizableNode): NodeSize {
    const { measured, type } = node;
    if (
        measured &&
        typeof measured.width === "number" &&
        measured.width > 0 &&
        typeof measured.height === "number" &&
        measured.height > 0
    ) {
        return { w: measured.width, h: measured.height };
    }
    if (type && NODE_SIZE_TABLE[type]) return NODE_SIZE_TABLE[type];
    if (type && type in NODE_TYPE_TO_ABI_FEATURE) {
        return DEFAULT_EXECUTABLE_SIZE;
    }
    return DEFAULT_SIZE;
}
