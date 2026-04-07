/**
 * OpenRouter Text-to-Multi-Text（文本拆分）
 *
 * 与 gemini-t2mt 相同契约：返回 { texts: string[] }。
 * 用 few-shot 示例约束「多段 JSON」，不用程序化拆句兜底。
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";
import { notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "minimax/minimax-m2.5:free";

const SYSTEM_PROMPT = `你是文本拆分助手。输出JSON，键为 texts，值为字符串数组；每个字符串是一段，禁止把全文塞进 texts 里只有一个元素（除非用户明确要求不拆或输入极短）。
不要 markdown，不要解释，只输出 JSON。`;

/** Few-shot：示范「多句 → 多条」「多段 → 多条」 */
const FEW_SHOT: { user: string; assistant: string }[] = [
    {
        user: `【示例】按句拆成多段。

用户输入：今天天气很好。我去了公园。晚上回家做饭。

输出要求：texts 里每项一句。`,
        assistant:
            '{"texts":["今天天气很好。","我去了公园。","晚上回家做饭。"]}',
    },
    {
        user: `【示例】按空行拆成多段。

用户输入：第一章开篇。

第二章转折。

第三章收尾。

输出要求：每段一项。`,
        assistant: '{"texts":["第一章开篇。","第二章转折。","第三章收尾。"]}',
    },
];

function parseTextsJson(content: string): { texts?: unknown } {
    try {
        return JSON.parse(content) as { texts?: unknown };
    } catch {
        const match = content.match(/\{[\s\S]*\}/);
        return match
            ? (JSON.parse(match[0]) as { texts?: unknown })
            : {};
    }
}

function normalizeTexts(raw: unknown): string[] {
    if (raw == null) return [];
    if (typeof raw === "string") {
        const s = raw.trim();
        return s ? [s] : [];
    }
    if (Array.isArray(raw)) {
        return raw
            .map((x) =>
                typeof x === "string" ? x.trim() : String(x).trim(),
            )
            .filter(Boolean);
    }
    return [];
}

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

    const actualUser = `${userPrompt ? `${userPrompt}\n\n` : ""}用户输入：${text}

输出要求：将「用户输入」拆成多段，放入 texts 数组（每段一个字符串）；有多句、多段或可拆单元时至少两段。仅当用户明确要求整段保留或输入短到无法拆时，才可只有一项。`;

    const messages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...FEW_SHOT.flatMap((shot) => [
            { role: "user" as const, content: shot.user },
            { role: "assistant" as const, content: shot.assistant },
        ]),
        { role: "user" as const, content: actualUser },
    ];

    const completion = await client.chat.completions.create(
        {
            model,
            temperature: 0.35,
            messages,
            response_format: { type: "json_object" },
        },
        { signal },
    );

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const resultJson = parseTextsJson(raw);
    const texts = normalizeTexts(resultJson.texts);

    notifyTask(task.taskId, TaskStatus.COMPLETED, { texts });

    return { texts };
}
