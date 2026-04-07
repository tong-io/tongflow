/**
 * ByteDance Image-to-Video
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
    const text = (prompt.text as string) || "";
    const imageUrl =
        (prompt.image as string) || (prompt.imageUrl as string) || "";
    const aspectRatio = prompt.aspect_ratio as string | undefined;

    if (!text || !imageUrl)
        return { success: false, error: "Missing text or image" };

    const createBody: Record<string, unknown> = {
        model: MODEL,
        content: [
            { type: "text", text },
            { type: "image_url", image_url: { url: imageUrl } },
        ],
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

    if (!createResp.ok)
        throw new Error(`ByteDance create failed: ${createResp.status}`);
    const { id: bdTaskId } = (await createResp.json()) as { id: string };

    // Poll
    const maxTime = 900_000;
    const start = Date.now();
    while (Date.now() - start < maxTime) {
        if (signal.aborted) throw new Error("Task cancelled");

        const poll = await fetch(
            `${BASE_URL}/content_generation/tasks/${bdTaskId}`,
            {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal,
            },
        );
        const data = (await poll.json()) as {
            status: string;
            content?: { video_url?: string };
            error?: string;
        };

        if (data.status === "succeeded" && data.content?.video_url) {
            const resp = await fetch(data.content.video_url, { signal });
            const bytes = Buffer.from(await resp.arrayBuffer());
            const fileKey = await saveFile(bytes, "mp4", task.taskId);
            return { success: true, file_key: fileKey, prompt: text };
        }
        if (data.status === "failed") throw new Error(data.error || "Failed");

        await new Promise((r) => setTimeout(r, 10_000));
    }

    throw new Error("Timed out");
}
