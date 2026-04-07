/**
 * Gemini Speech-to-Text (语音转文字)
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
    const text = (prompt.text as string) || "Transcribe this audio accurately.";
    const audioUrl =
        (prompt.audio as string) || (prompt.audioUrl as string) || "";

    if (!audioUrl) return { success: false, error: "Missing audio URL" };

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok)
        throw new Error(`Failed to download audio: ${audioResponse.status}`);
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const audioBase64 = audioBuffer.toString("base64");
    const audioMime = audioResponse.headers.get("content-type") || "audio/mp3";

    const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
            {
                role: "user",
                parts: [
                    { inlineData: { data: audioBase64, mimeType: audioMime } },
                    { text },
                ],
            },
        ],
    });

    const resultText =
        response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { success: true, text: resultText };
}
