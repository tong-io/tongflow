/** 旧版 eco/pro 存下的 *_pro feature → 当前仅保留的 GPU 路径 */
const LEGACY_PRO_TO_DEFAULT: Record<string, string> = {
    image_edit_pro: "image_edit",
    image_gen_pro: "image_gen",
    image_fusion_pro: "image_fusion",
    image_gen_video_pro: "image_gen_video",
    model_gen: "image_gen_model",
    /** compose 节点曾误用下划线形式，与 registry 不一致 */
    speech_text_gen_video: "speech-text-gen-video",
};

/**
 * 解析节点应使用的 feature（兼容旧画布里存的 pro / *_pro）。
 */
export function resolveNodeModelFeature(
    stored: string | undefined,
    defaultFeature: string,
): string {
    if (!stored) return defaultFeature;
    return LEGACY_PRO_TO_DEFAULT[stored] ?? stored;
}

/** 将解析结果限制在仍提供的模型列表内（单选下拉可扩展时复用）。 */
export function clampToAllowedModel(
    stored: string | undefined,
    allowed: readonly string[],
    defaultFeature: string,
): string {
    const r = resolveNodeModelFeature(stored, defaultFeature);
    return allowed.includes(r) ? r : defaultFeature;
}
