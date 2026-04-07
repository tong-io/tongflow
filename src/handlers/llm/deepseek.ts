/**
 * DeepSeek LLM Handler
 *
 * 使用 DeepSeek 推理模型（deepseek-reasoner）生成文本。
 * 支持流式输出，按句推送。
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";
import { notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";
import { splitBySentence } from "./utils";

export async function handler(
    task: TaskData,
    signal: AbortSignal,
): Promise<HandlerResult> {
    const OpenAI = (await import("openai")).default;

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

    const client = new OpenAI({
        apiKey,
        baseURL: "https://api.deepseek.com/v1",
    });

    const prompt = task.prompt;
    const text = (prompt.text as string) || "";
    const userPrompt = (prompt.userPrompt as string) || "";

    const userMessage = `${userPrompt}\n\n用户输入：${text}\n\n注意：除了明确的答案本身，不要生成任何其他多余内容。`;

    const stream = await client.chat.completions.create(
        {
            model: "deepseek-reasoner",
            temperature: 1,
            messages: [
                {
                    role: "system",
                    content:
                        "你是一个根据用户要求进行文本生成的万能助手，请严格按照用户的要求进行文本生成。",
                },
                { role: "user", content: userMessage },
            ],
            stream: true,
        },
        { signal },
    );

    let answerContent = "";
    let answerBuffer = "";

    for await (const chunk of stream) {
        if (signal.aborted) throw new Error("Task cancelled");

        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // DeepSeek reasoning content
        const reasoning = (delta as Record<string, unknown>)
            .reasoning_content as string | undefined;
        if (reasoning) {
            notifyTask(task.taskId, TaskStatus.RUNNING, {
                type: "reasoning",
                content: reasoning,
            });
        }

        // Answer content
        if (delta.content) {
            answerContent += delta.content;
            answerBuffer += delta.content;

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

    // Flush remaining buffer
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
