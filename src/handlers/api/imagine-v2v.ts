/**
 * X.AI Imagine Video-to-Video (视频编辑)
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
    const text = (prompt.text as string) || "";
    const videoUrl =
        (prompt.video as string) || (prompt.videoUrl as string) || "";

    if (!text || !videoUrl)
        return { success: false, error: "Missing text or video" };

    const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            prompt: text,
            model: "grok-imagine-video",
            video_url: videoUrl,
        }),
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

    const resultUrl = data.url || data.video_url || data.data?.[0]?.url;
    if (!resultUrl) throw new Error("No video URL in response");

    const videoResp = await fetch(resultUrl, { signal });
    const bytes = Buffer.from(await videoResp.arrayBuffer());
    const fileKey = await saveFile(bytes, "mp4", task.taskId);

    return { success: true, file_key: fileKey, prompt: text };
}
