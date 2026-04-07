/**
 * Gemini Text LLM Handler
 *
 * 使用 Google Gemini Pro 模型生成文本。
 * 支持流式输出，按句推送。带 Google Search 和 URL Context 工具。
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";
import { notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";
import { resolveGeminiTextModel, splitBySentence } from "./utils";

export async function handler(
    task: TaskData,
    signal: AbortSignal,
): Promise<HandlerResult> {
    const { GoogleGenAI } = await import("@google/genai");

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const client = new GoogleGenAI({ apiKey });
    const prompt = task.prompt;
    const text = (prompt.text as string) || "";
    const userPrompt = (prompt.userPrompt as string) || "";

    const modelId = resolveGeminiTextModel(prompt);

    const userMessage = `${userPrompt}\n\n用户输入：${text}\n\n注意：除了明确的答案本身，不要生成任何其他多余内容。`;

    const response = await client.models.generateContentStream({
        model: modelId,
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        config: {
            systemInstruction:
                "You are an adaptable and highly capable AI agent. Your tone, format, and specific tasks are dictated entirely by the user's prompt. Strictly follow the user's constraints regarding output format, language, and length.",
            tools: [{ googleSearch: {} }, { urlContext: {} }],
            temperature: 1.0,
        },
    });

    let answerContent = "";
    let answerBuffer = "";

    for await (const chunk of response) {
        if (signal.aborted) throw new Error("Task cancelled");

        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.text) {
                answerContent += part.text;
                answerBuffer += part.text;

                const sentences = splitBySentence(answerBuffer);
                if (sentences.length > 1) {
                    for (const sentence of sentences.slice(0, -1)) {
                        notifyTask(task.taskId, TaskStatus.RUNNING, {
                            type: "answer",
                            content: sentence,
                        });
                    }
                    answerBuffer = sentences[sentences.length - 1];
                }
            }
        }
    }

    if (answerBuffer.trim()) {
        notifyTask(task.taskId, TaskStatus.RUNNING, {
            type: "answer",
            content: answerBuffer.trim(),
        });
    }

    const result = answerContent.trim();

    notifyTask(task.taskId, TaskStatus.COMPLETED, {
        result,
        mode: "stream",
    });

    return { result };
}
