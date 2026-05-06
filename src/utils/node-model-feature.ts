/** Legacy *_pro features stored under eco/pro → the only GPU path retained now */
const LEGACY_PRO_TO_DEFAULT: Record<string, string> = {
    image_edit_pro: "image-edit",
    image_gen_pro: "image-gen",
    image_fusion_pro: "image-fusion",
    image_gen_video_pro: "image-gen-video",
    model_gen: "image-gen-model",
};

/**
 * Resolve the feature a node should use (compatible with legacy pro/*_pro values stored in old canvases).
 */
export function resolveNodeModelFeature(
    stored: string | undefined,
    defaultFeature: string,
): string {
    if (!stored) return defaultFeature;
    return LEGACY_PRO_TO_DEFAULT[stored] ?? stored;
}

/** Clamp the resolved result to the still-available model list (reusable when a single-select dropdown expands). */
export function clampToAllowedModel(
    stored: string | undefined,
    allowed: readonly string[],
    defaultFeature: string,
): string {
    const r = resolveNodeModelFeature(stored, defaultFeature);
    return allowed.includes(r) ? r : defaultFeature;
}
