/**
 * X.AI Imagine Text-to-Video
 *
 * 使用 X.AI Grok Imagine Video 模型生成视频。
 * 需要 XAI_API_KEY 环境变量。
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";

const API_URL = "https://api.x.ai/v1/video/generations";

export async function handler(
    task: TaskData,
    signal: AbortSignal,
): Promise<HandlerResult> {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error("XAI_API_KEY is not set");

    const prompt = task.prompt;
    const text = (prompt.text as string) || (prompt.prompt as string) || "";
    const duration = prompt.duration as number | undefined;
    const aspectRatio = prompt.aspect_ratio as string | undefined;

    if (!text) return { success: false, error: "Missing prompt text" };

    const body: Record<string, unknown> = {
        prompt: text,
        model: "grok-imagine-video",
    };
    if (duration) body.duration = duration;
    if (aspectRatio) body.aspect_ratio = aspectRatio;

    // Create generation task
    const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`X.AI API error: ${resp.status} ${errText}`);
    }

    const data = (await resp.json()) as {
        url?: string;
        video_url?: string;
        data?: Array<{ url?: string }>;
    };

    const videoUrl = data.url || data.video_url || data.data?.[0]?.url;
    if (!videoUrl) throw new Error("No video URL in response");

    const videoResp = await fetch(videoUrl, { signal });
    if (!videoResp.ok) throw new Error(`Download failed: ${videoResp.status}`);
    const bytes = Buffer.from(await videoResp.arrayBuffer());
    const fileKey = await saveFile(bytes, "mp4", task.taskId);

    return { success: true, file_key: fileKey, prompt: text };
}
