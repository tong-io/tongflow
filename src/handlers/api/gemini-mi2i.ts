/**
 * Gemini Multi-Image-to-Image (多图编辑)
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
    const imageUrls = (prompt.images as string[]) || [];

    if (!text || imageUrls.length === 0) {
        return { success: false, error: "Missing text or images" };
    }

    // Download all images
    const parts: Array<Record<string, unknown>> = [];
    for (const url of imageUrls) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to download image: ${url}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        const mime = resp.headers.get("content-type") || "image/png";
        parts.push({
            inlineData: { data: buf.toString("base64"), mimeType: mime },
        });
    }
    parts.push({ text });

    const response = await client.models.generateContent({
        model: "gemini-2.0-flash-preview-image-generation",
        contents: [{ role: "user", parts }],
        config: { responseModalities: ["IMAGE", "TEXT"] },
    });

    const outParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of outParts) {
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
