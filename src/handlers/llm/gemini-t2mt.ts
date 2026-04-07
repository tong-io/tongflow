/**
 * Gemini Text-to-Multi-Text (文本拆分)
 *
 * 将一段文本拆分为多个片段，返回结构化 JSON。
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";
import { notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";
import { resolveGeminiTextModel } from "./utils";

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

    const userMessage = `${userPrompt}\n\n用户输入：${text}`;

    const response = await client.models.generateContent({
        model: resolveGeminiTextModel(prompt),
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        config: {
            systemInstruction:
                "You are a text processing assistant. Split the input text into logical segments as requested.",
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    texts: {
                        type: "array",
                        items: { type: "string" },
                        description: "Array of text segments after splitting",
                    },
                },
                required: ["texts"],
            },
            temperature: 0.5,
        },
    });

    const resultJson = JSON.parse(response.text || "{}") as {
        texts?: string[];
    };
    const texts = resultJson.texts || [];

    notifyTask(task.taskId, TaskStatus.COMPLETED, { texts });

    return { texts };
}
