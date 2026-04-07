/**
 * Gemini Video-to-Text (视频描述)
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";

export async function handler(
    task: TaskData,
    signal: AbortSignal,
): Promise<HandlerResult> {
    const { GoogleGenAI } = await import("@google/genai");

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const client = new GoogleGenAI({ apiKey });
    const prompt = task.prompt;
    const text = (prompt.text as string) || "Describe this video in detail.";
    const videoUrl =
        (prompt.video as string) || (prompt.videoUrl as string) || "";

    if (!videoUrl) return { success: false, error: "Missing video URL" };

    const vidResponse = await fetch(videoUrl);
    if (!vidResponse.ok)
        throw new Error(`Failed to download video: ${vidResponse.status}`);
    const vidBuffer = Buffer.from(await vidResponse.arrayBuffer());
    const vidBase64 = vidBuffer.toString("base64");
    const vidMime = vidResponse.headers.get("content-type") || "video/mp4";

    const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
            {
                role: "user",
                parts: [
                    { inlineData: { data: vidBase64, mimeType: vidMime } },
                    { text },
                ],
            },
        ],
    });

    const resultText =
        response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { success: true, text: resultText };
}
