/**
 * OpenRouter Free Models Router（openrouter/free）
 *
 * 与 deepseek / openai 节点 prompt 形状一致；流式按句推送。
 * @see https://openrouter.ai/docs/models/free-models-router
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";
import { notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";
import { splitBySentence } from "./utils";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "minimax/minimax-m2.5:free";

export async function handler(
    task: TaskData,
    signal: AbortSignal,
): Promise<HandlerResult> {
    const OpenAI = (await import("openai")).default;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

    const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
    const title = process.env.OPENROUTER_APP_TITLE?.trim();

    const client = new OpenAI({
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        ...(referer || title
            ? {
                  defaultHeaders: {
                      ...(referer ? { "HTTP-Referer": referer } : {}),
                      ...(title ? { "X-Title": title } : {}),
                  },
              }
            : {}),
    });

    const model =
        process.env.OPENROUTER_FREE_MODEL?.trim() || DEFAULT_MODEL;

    const prompt = task.prompt;
    const text = (prompt.text as string) || "";
    const userPrompt = (prompt.userPrompt as string) || "";

    const userMessage = `${userPrompt}\n\n用户输入：${text}\n\n注意：除了明确的答案本身，不要生成任何其他多余内容。`;

    const stream = await client.chat.completions.create(
        {
            model,
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

        const d = delta as Record<string, unknown>;
        const reasoning =
            typeof d.reasoning === "string"
                ? d.reasoning
                : typeof d.reasoning_content === "string"
                  ? d.reasoning_content
                  : undefined;
        if (reasoning) {
            notifyTask(task.taskId, TaskStatus.RUNNING, {
                type: "reasoning",
                content: reasoning,
            });
        }

        const piece = delta.content;
        if (!piece) continue;

        answerContent += piece;
        answerBuffer += piece;

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
