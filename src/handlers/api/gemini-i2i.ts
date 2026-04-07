/**
 * Gemini Image-to-Image (图像编辑)
 *
 * 使用 Google Gemini 模型编辑图片。
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
    const text = (prompt.text as string) || "";
    const imageUrl =
        (prompt.image as string) || (prompt.imageUrl as string) || "";

    if (!text || !imageUrl) {
        return { success: false, error: "Missing text or image URL" };
    }

    // Download input image
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok)
        throw new Error(`Failed to download image: ${imgResponse.status}`);
    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
    const imgBase64 = imgBuffer.toString("base64");
    const imgMime = imgResponse.headers.get("content-type") || "image/png";

    const response = await client.models.generateContent({
        model: "gemini-2.0-flash-preview-image-generation",
        contents: [
            {
                role: "user",
                parts: [
                    { inlineData: { data: imgBase64, mimeType: imgMime } },
                    { text },
                ],
            },
        ],
        config: {
            responseModalities: ["IMAGE", "TEXT"],
        },
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        if (part.inlineData?.data) {
            const outBytes = Buffer.from(part.inlineData.data, "base64");
            const mime = part.inlineData.mimeType || "image/png";
            const ext = mime.includes("jpeg")
                ? "jpg"
                : mime.includes("webp")
                  ? "webp"
                  : "png";
            const fileKey = await saveFile(outBytes, ext, task.taskId);

            return { success: true, file_key: fileKey };
        }
    }

    return { success: false, error: "No images generated" };
}
