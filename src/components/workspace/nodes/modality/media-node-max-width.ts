/**
 * Image/video nodes: the canvas node width is proportional to the media long-edge pixel count (for example, 1024 and 2048 are about 1:2),
 * making resolution differences easier to compare visually. Min/max values prevent nodes from becoming too small or covering the canvas.
 */

/** Reference long edge (px): this length maps to a node width of REF_DISPLAY_WIDTH_PX */
export const MEDIA_NODE_REF_LONG_EDGE_PX = 1024;

/** Target outer node width (CSS px) when the long edge equals REF */
export const MEDIA_NODE_REF_DISPLAY_WIDTH_PX = 256;

export const MEDIA_NODE_MIN_DISPLAY_WIDTH_PX = 120;
export const MEDIA_NODE_MAX_DISPLAY_WIDTH_PX = 720;

/**
 * Calculate the canvas node width (px) linearly from the long edge, rounded and clamped.
 */
export function proportionalMediaNodeWidthPx(
    width: number,
    height: number,
): number {
    const long = Math.max(width, height);
    if (!Number.isFinite(long) || long <= 0) {
        return MEDIA_NODE_REF_DISPLAY_WIDTH_PX;
    }
    const raw =
        (long / MEDIA_NODE_REF_LONG_EDGE_PX) * MEDIA_NODE_REF_DISPLAY_WIDTH_PX;
    return Math.round(
        Math.min(
            MEDIA_NODE_MAX_DISPLAY_WIDTH_PX,
            Math.max(MEDIA_NODE_MIN_DISPLAY_WIDTH_PX, raw),
        ),
    );
}
