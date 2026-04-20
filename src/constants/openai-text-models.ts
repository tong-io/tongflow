/**
 * OpenAI Chat 模型选项（与 text-gen-text / openai-text handler 一致）
 */
export const DEFAULT_OPENAI_TEXT_MODEL = "gpt-4o-mini";

export const OPENAI_TEXT_MODEL_OPTIONS: { value: string; label: string }[] = [
    { value: "gpt-4o-mini", label: "GPT-4o mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "o4-mini", label: "o4-mini" },
];
