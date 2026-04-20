/**
 * LLM 工具函数
 */

import { DEFAULT_GEMINI_TEXT_MODEL } from "@/constants/gemini-text-models";
import { DEFAULT_OPENAI_TEXT_MODEL } from "@/constants/openai-text-models";

/**
 * 从任务 prompt 解析 Gemini 模型 ID（默认与节点下拉框一致，不依赖环境变量）
 */
export function resolveGeminiTextModel(
    prompt: Record<string, unknown>,
): string {
    const fromPrompt =
        typeof prompt.geminiModel === "string" ? prompt.geminiModel.trim() : "";
    if (fromPrompt) return fromPrompt;
    return DEFAULT_GEMINI_TEXT_MODEL;
}

/**
 * 从任务 prompt 解析 OpenAI Chat 模型；否则用 OPENAI_CHAT_MODEL，再退回默认。
 */
export function resolveOpenAiTextModel(
    prompt: Record<string, unknown>,
): string {
    const fromPrompt =
        typeof prompt.openaiModel === "string" ? prompt.openaiModel.trim() : "";
    if (fromPrompt) return fromPrompt;
    const fromEnv = process.env.OPENAI_CHAT_MODEL?.trim();
    if (fromEnv) return fromEnv;
    return DEFAULT_OPENAI_TEXT_MODEL;
}

/**
 * 按句分割文本，支持中英文标点和换行
 */
export function splitBySentence(text: string): string[] {
    const pattern = /([。！？!?；;\n])/;
    const parts = text.split(pattern);

    const result: string[] = [];
    for (let i = 0; i < parts.length - 1; i += 2) {
        const sentence = parts[i];
        const punctuation = parts[i + 1] || "";
        result.push(sentence + punctuation);
    }

    // Handle trailing part without punctuation
    if (parts.length % 2 === 1 && parts[parts.length - 1]) {
        result.push(parts[parts.length - 1]);
    }

    return result;
}
