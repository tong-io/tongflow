/**
 * ByteDance Text-to-Video
 *
 * 使用字节跳动 ModelArk API 生成视频。
 * 需要 ARK_API_KEY 环境变量。
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";

const BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const MODEL = "seedance-1-5-pro-251215";

export async function handler(
    task: TaskData,
    signal: AbortSignal,
): Promise<HandlerResult> {
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) throw new Error("ARK_API_KEY is not set");

    const prompt = task.prompt;
    const text = (prompt.text as string) || (prompt.prompt as string) || "";
    const duration = prompt.duration as number | undefined;
    const aspectRatio = prompt.aspect_ratio as string | undefined;

    if (!text) return { success: false, error: "Missing prompt text" };

    // 1. Create task
    const createBody: Record<string, unknown> = {
        model: MODEL,
        content: [{ type: "text", text }],
    };
    if (aspectRatio) createBody.ratio = aspectRatio;

    const createResp = await fetch(`${BASE_URL}/content_generation/tasks`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(createBody),
        signal,
    });

    if (!createResp.ok) {
        throw new Error(`ByteDance create task failed: ${createResp.status}`);
    }

    const createData = (await createResp.json()) as { id?: string };
    const taskIdBd = createData.id;
    if (!taskIdBd) throw new Error("No task ID returned from ByteDance");

    // 2. Poll for completion
    const maxPollingTime = 900_000; // 15 min
    const pollInterval = 10_000; // 10s
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollingTime) {
        if (signal.aborted) throw new Error("Task cancelled");

        const pollResp = await fetch(
            `${BASE_URL}/content_generation/tasks/${taskIdBd}`,
            {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal,
            },
        );

        if (!pollResp.ok) throw new Error(`Poll failed: ${pollResp.status}`);

        const pollData = (await pollResp.json()) as {
            status: string;
            content?: { video_url?: string };
            error?: string;
        };

        if (pollData.status === "succeeded") {
            const videoUrl = pollData.content?.video_url;
            if (!videoUrl) throw new Error("No video URL in response");

            // Download and save locally
            const videoResp = await fetch(videoUrl, { signal });
            if (!videoResp.ok)
                throw new Error(`Download video failed: ${videoResp.status}`);
            const videoBytes = Buffer.from(await videoResp.arrayBuffer());
            const fileKey = await saveFile(videoBytes, "mp4", task.taskId);

            return {
                success: true,
                file_key: fileKey,
                prompt: text,
                duration,
                aspect_ratio: aspectRatio,
            };
        }

        if (pollData.status === "failed") {
            throw new Error(
                `Video generation failed: ${pollData.error || "Unknown"}`,
            );
        }

        await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error("Video generation timed out");
}
