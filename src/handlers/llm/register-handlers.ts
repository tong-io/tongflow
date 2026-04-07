/**
 * 注册 LLM 类任务 handlers（gen_text、split_text 等）
 */

import { registerHandler } from "@/lib/task-runner";
import { handler as geminiHandler } from "@/handlers/llm/gemini";
import { handler as deepseekHandler } from "@/handlers/llm/deepseek";
import { handler as openaiTextHandler } from "@/handlers/llm/openai-text";
import { handler as openrouterFreeHandler } from "@/handlers/llm/openrouter-free";
import { handler as openrouterT2mtHandler } from "@/handlers/llm/openrouter-t2mt";
import { handler as geminiT2mtHandler } from "@/handlers/llm/gemini-t2mt";
import { handler as geminiMt2tHandler } from "@/handlers/llm/gemini-mt2t";

export function registerLlmHandlers(): void {
    registerHandler("llm", "gemini", geminiHandler);
    registerHandler("llm", "deepseek", deepseekHandler);
    registerHandler("llm", "openai", openaiTextHandler);
    registerHandler("llm", "openrouter_free", openrouterFreeHandler);
    registerHandler("llm", "openrouter_t2mt", openrouterT2mtHandler);

    registerHandler("llm", "gemini_t2mt", geminiT2mtHandler);
    registerHandler("llm", "gemini_mt2t", geminiMt2tHandler);
}
