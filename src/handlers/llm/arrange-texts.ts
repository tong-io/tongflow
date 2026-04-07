/**
 * 文本排列组合
 *
 * 使用 DeepSeek 推理模型将一组文本按用户要求分组排列。
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";
import { notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";

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
    const fileKeys = (prompt.fileKeys as string[]) || [];
    const infos = (prompt.infos as unknown[]) || [];
    const query = (prompt.query as string) || "";
    const groupCount = (prompt.groupCount as number) || 3;
    const duplicatable = prompt.duplicatable !== false;

    let texts = "";
    for (let i = 0; i < infos.length; i++) {
        texts += `${i + 1}. ${JSON.stringify(infos[i])}\n\n`;
    }

    const userPrompt = `
你是一个分组大师。
请根据给定的信息，从给定的序号中抽取多个作为一组，要求：${query}
组之间序号${duplicatable ? "可以" : "不能"}重复

回答格式：每组一行，每行是用逗号分隔的序号。
不要返回解释和其他任何内容。

给定信息如下：
${texts}

请给我${groupCount}组。
`.trim();

    const response = await client.chat.completions.create(
        {
            model: "deepseek-reasoner",
            messages: [
                { role: "system", content: "你是一个精确的文本分组分析助手。" },
                { role: "user", content: userPrompt },
            ],
        },
        { signal },
    );

    const resultText = response.choices[0]?.message?.content?.trim() || "";

    // Parse "1,2,3\n2,1" into groups of fileKeys
    const groups: string[][] = [];
    for (const line of resultText.split("\n")) {
        const numbers = line.match(/\d+/g);
        if (numbers) {
            const group: string[] = [];
            for (const n of numbers) {
                const idx = parseInt(n) - 1;
                if (idx >= 0 && idx < fileKeys.length) {
                    group.push(fileKeys[idx]);
                }
            }
            if (group.length > 0) groups.push(group);
        }
    }

    if (groups.length === 0) throw new Error("无法解析分组结果");

    notifyTask(task.taskId, TaskStatus.COMPLETED, {
        groups,
        raw: resultText,
    });

    return { groups, raw: resultText } as unknown as HandlerResult;
}
