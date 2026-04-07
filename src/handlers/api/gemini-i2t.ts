/**
 * Gemini Image-to-Text (图像描述/OCR)
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
    const text = (prompt.text as string) || "Describe this image in detail.";
    const imageUrl =
        (prompt.image as string) || (prompt.imageUrl as string) || "";

    if (!imageUrl) return { success: false, error: "Missing image URL" };

    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok)
        throw new Error(`Failed to download image: ${imgResponse.status}`);
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
    const imgBase64 = imgBuffer.toString("base64");
    const imgMime = imgResponse.headers.get("content-type") || "image/png";

    const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
            {
                role: "user",
                parts: [
                    { inlineData: { data: imgBase64, mimeType: imgMime } },
                    { text },
                ],
            },
        ],
    });

    const resultText =
        response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return { success: true, text: resultText };
}
