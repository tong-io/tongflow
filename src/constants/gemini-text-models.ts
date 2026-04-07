/**
 * Gemini 文本生成（generateContent / 流式）可用模型列表。
 * 仅包含文本输出场景；不含纯图像、TTS、视频、Embedding 等。
 *
 * @see https://ai.google.dev/gemini-api/docs/models
 */

export const DEFAULT_GEMINI_TEXT_MODEL = "gemini-2.5-flash";

/** 选项顺序：稳定 2.5 → 3 预览 → 2.0 弃用 → latest 别名 */
export const GEMINI_TEXT_MODEL_OPTIONS: readonly {
    value: string;
    label: string;
}[] = [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (recommended)" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
    {
        value: "gemini-3.1-flash-lite-preview",
        label: "Gemini 3.1 Flash-Lite (Preview)",
    },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (deprecated)" },
    {
        value: "gemini-2.0-flash-lite",
        label: "Gemini 2.0 Flash-Lite (deprecated)",
    },
    { value: "gemini-flash-latest", label: "gemini-flash-latest" },
    { value: "gemini-pro-latest", label: "gemini-pro-latest" },
];
