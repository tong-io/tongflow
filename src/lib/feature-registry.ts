/**
 * Feature Registry (hardcoded)
 *
 * 开源版使用静态注册表替代数据库 features 表。
 * 添加新功能时，在 FEATURES 数组中添加一项即可。
 */

export interface FeatureDefinition {
    name: string;
    type: string;
    function: string;
    price: number;
    isFree: boolean;
    processingTime: number;
    minTier: string;
}

const FEATURES: FeatureDefinition[] = [
    // ==================== LLM ====================
    {
        name: "gen_text",
        type: "llm",
        function: "openrouter_free",
        price: 0,
        isFree: true,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "gen_text_gemini",
        type: "llm",
        function: "gemini",
        price: 1,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "gen_text_deepseek",
        type: "llm",
        function: "deepseek",
        price: 1,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "gen_text_openai",
        type: "llm",
        function: "openai",
        price: 1,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "split_text",
        type: "llm",
        function: "openrouter_t2mt",
        price: 0,
        isFree: true,
        processingTime: 0,
        minTier: "free",
    },
    {
        name: "combine_text",
        type: "llm",
        function: "gemini_mt2t",
        price: 1,
        isFree: false,
        processingTime: 0,
        minTier: "free",
    },

    // ==================== API ====================
    {
        name: "image_fusion",
        type: "gpu",
        function: "flux2-klein9b-fusion",
        price: 15,
        isFree: false,
        processingTime: 15,
        minTier: "free",
    },
    {
        name: "image_gen_text",
        type: "gpu",
        function: "gemma4-i2t",
        price: 5,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "video_gen_text",
        type: "gpu",
        function: "gemma4-v2t",
        price: 20,
        isFree: false,
        processingTime: 0,
        minTier: "free",
    },

    // ==================== CPU (Modal) ====================
    {
        name: "transcribe",
        type: "gpu",
        function: "qwen3-asr",
        price: 10,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "concat_videos",
        type: "cpu",
        function: "ffmpeg",
        price: 5,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "extract_audio",
        type: "cpu",
        function: "ffmpeg-extract-audio",
        price: 5,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "merge_video_audio",
        type: "cpu",
        function: "ffmpeg-merge",
        price: 1,
        isFree: false,
        processingTime: 0,
        minTier: "free",
    },
    {
        name: "get_first_frame",
        type: "cpu",
        function: "ffmpeg-first-frame",
        price: 5,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "get_last_frame",
        type: "cpu",
        function: "ffmpeg-last-frame",
        price: 5,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "parse_document",
        type: "cpu",
        function: "docling",
        price: 10,
        isFree: false,
        processingTime: 0,
        minTier: "free",
    },
    {
        name: "split_video",
        type: "cpu",
        function: "scenedetect",
        price: 5,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "link",
        type: "cpu",
        function: "crawl4ai",
        price: 5,
        isFree: false,
        processingTime: 30,
        minTier: "free",
    },

    // ==================== GPU ====================
    {
        name: "gen_video",
        type: "gpu",
        function: "wan22-t2v-smoothmix",
        price: 20,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "image_gen",
        type: "gpu",
        function: "zimage-t2i",
        price: 5,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "gen_music",
        type: "gpu",
        function: "ace-step",
        price: 20,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "gen_speech",
        type: "gpu",
        function: "indextts2",
        price: 10,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "image_gen_video",
        type: "gpu",
        function: "ltx2-i2v",
        price: 20,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "image_edit",
        type: "gpu",
        function: "flux2-klein9b-edit",
        price: 10,
        isFree: false,
        processingTime: 10,
        minTier: "free",
    },
    {
        name: "image_upscale",
        type: "gpu",
        function: "seedvr2-image-upscale",
        price: 10,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "video_upscale",
        type: "gpu",
        function: "seedvr2-video-upscale",
        price: 10,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "image_describe",
        type: "gpu",
        function: "qwen3vl-image",
        price: 10,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "video_describe",
        type: "gpu",
        function: "qwen3vl-video",
        price: 10,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "audio_image_gen_video",
        type: "gpu",
        function: "infinitetalk-si2v",
        price: 30,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "speech-text-gen-video",
        type: "gpu",
        function: "ltx2-a2v",
        price: 30,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "speech_image_video_gen_video",
        type: "gpu",
        function: "wan22-siv2v",
        price: 30,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "video-image-gen-video-mix",
        type: "gpu",
        function: "wan-animate-mix",
        price: 30,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "video-image-gen-video-move",
        type: "gpu",
        function: "wan-animate-move",
        price: 30,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "image-image-gen-video",
        type: "gpu",
        function: "ltx2-ii2v-first-last",
        price: 30,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "text_gen_video",
        type: "gpu",
        function: "ltx2-t2v",
        price: 20,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "image_gen_model",
        type: "gpu",
        function: "hunyuan3d-single-view",
        price: 30,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "speech_video_gen_video",
        type: "gpu",
        function: "infinitetalk-sv2v",
        price: 30,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "text_gen_speech_clone",
        type: "gpu",
        function: "qwen-tts3-reference",
        price: 30,
        isFree: false,
        processingTime: 60,
        minTier: "starter",
    },
    {
        name: "text_gen_speech_emotion",
        type: "gpu",
        function: "setpaudio-editx-emotion",
        price: 30,
        isFree: false,
        processingTime: 30,
        minTier: "starter",
    },
    {
        name: "text_gen_speech_style",
        type: "gpu",
        function: "setpaudio-editx-style",
        price: 30,
        isFree: false,
        processingTime: 30,
        minTier: "starter",
    },
    {
        name: "transcribe_timestamp",
        type: "gpu",
        function: "qwen3-asr-timestamp",
        price: 10,
        isFree: false,
        processingTime: 10,
        minTier: "starter",
    },
    {
        name: "text_gen_speech_instruct",
        type: "gpu",
        function: "qwen-tts3-design",
        price: 10,
        isFree: false,
        processingTime: 0,
        minTier: "free",
    },
    {
        name: "video_image_move_animal",
        type: "gpu",
        function: "steadydancer",
        price: 100,
        isFree: false,
        processingTime: 0,
        minTier: "free",
    },
    {
        name: "wan-animate-mix",
        type: "gpu",
        function: "wan-animate-mix",
        price: 50,
        isFree: false,
        processingTime: 0,
        minTier: "free",
    },

];

const featureMap = new Map<string, FeatureDefinition>(
    FEATURES.map((f) => [f.name, f]),
);

/** 历史节点 data / 旧代码里用过的名称 → 当前 registry `name` */
const FEATURE_NAME_ALIASES: Record<string, string> = {
    ii2v_first_last: "image-image-gen-video",
};

/**
 * 将请求或节点里存的 feature 名解析为 registry 中的 canonical `name`。
 */
export function resolveCanonicalFeatureName(name: string): string {
    return FEATURE_NAME_ALIASES[name] ?? name;
}

export function getFeatureByName(name: string): FeatureDefinition | undefined {
    const key = resolveCanonicalFeatureName(name);
    return featureMap.get(key);
}

export function getAllFeatures(): FeatureDefinition[] {
    return FEATURES;
}
