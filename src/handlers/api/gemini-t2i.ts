/**
 * Gemini Text-to-Image
 *
 * 使用 Google Gemini 模型从文本生成图片。
 */

import type { TaskData, HandlerResult } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";

export async function handler(
    task: TaskData,
    signal: AbortSignal,
): Promise<HandlerResult> {
    const { GoogleGenAI } = await import("@google/genai");

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const client = new GoogleGenAI({ apiKey });
    const prompt = task.prompt;
    const text = (prompt.text as string) || (prompt.prompt as string) || "";
    const width = Number(prompt.width) || 1024;
    const height = Number(prompt.height) || 1024;

    if (!text) return { success: false, error: "Missing prompt text" };

    // Calculate aspect ratio
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const g = gcd(width, height);
    const aspectRatio = `${width / g}:${height / g}`;

    const response = await client.models.generateContent({
        model: "gemini-2.0-flash-preview-image-generation",
        contents: text,
        config: {
            responseModalities: ["IMAGE", "TEXT"],
            imageConfig: {
                aspectRatio,
            },
        },
    });

    // Extract image data from response
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        if (part.inlineData?.data) {
            const imgBytes = Buffer.from(part.inlineData.data, "base64");
            const mime = part.inlineData.mimeType || "image/png";
            const extMap: Record<string, string> = {
                "image/png": "png",
                "image/jpeg": "jpg",
                "image/webp": "webp",
            };
            const ext = extMap[mime] || "png";

            const fileKey = await saveFile(imgBytes, ext, task.taskId);

            return {
                success: true,
                file_key: fileKey,
                prompt: text,
                width,
                height,
            };
        }
    }

    return { success: false, error: "No images generated" };
}
