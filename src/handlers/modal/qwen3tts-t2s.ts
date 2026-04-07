/**
 * Qwen3-TTS 文本生成语音（Modal GPU）
 *
 * 对应 modal/gpu/qwen3tts.py：App `qwen3-tts`，Cls `Design`，方法 `generate`。
 * 返回 WAV bytes，需落盘并返回 file_key。
 */

import type { TaskData, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";
import { ModalClient } from "modal";

const APP_NAME = "qwen3-tts";
const CLS_DESIGN = "Design";
const CLS_REFERENCE = "Reference";

function toBuffer(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (typeof raw === "string") return Buffer.from(raw, "base64");
    throw new Error("Unexpected Modal return type for audio bytes");
}

function mapLanguage(input: unknown): string {
    if (typeof input !== "string") return "Chinese";
    const v = input.trim().toLowerCase();
    if (!v) return "Chinese";
    if (v === "zh" || v === "中文" || v === "chinese") return "Chinese";
    if (v === "en" || v === "english") return "English";
    if (v === "ja" || v === "jp" || v === "japanese") return "Japanese";
    return input;
}

export function registerQwen3TtsDesignT2sHandler(): void {
    const handler: TaskHandler = async (
        task: TaskData,
        signal: AbortSignal,
    ) => {
        const p = task.prompt ?? {};

        const text = typeof p.text === "string" ? p.text.trim() : "";
        const instruct =
            typeof (p as Record<string, unknown>).description === "string"
                ? ((p as Record<string, unknown>).description as string).trim()
                : typeof (p as Record<string, unknown>).instruct === "string"
                  ? ((p as Record<string, unknown>).instruct as string).trim()
                  : "";
        const language = mapLanguage((p as Record<string, unknown>).language);

        const maxNewTokensRaw = (p as Record<string, unknown>).max_new_tokens;
        const max_new_tokens =
            typeof maxNewTokensRaw === "number"
                ? Math.floor(maxNewTokensRaw)
                : Number(maxNewTokensRaw) > 0
                  ? Math.floor(Number(maxNewTokensRaw))
                  : 2048;

        if (!text) {
            return { success: false, error: "Missing text" };
        }

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_DESIGN);
        const instance = await cls.instance();
        const generate = instance.method("generate");

        const call = await generate.spawn([], {
            text,
            language,
            instruct,
            max_new_tokens: Math.min(4096, Math.max(256, max_new_tokens)),
        });

        const onAbort = () => {
            call.cancel({}).catch(() => {});
        };

        if (signal.aborted) {
            onAbort();
            throw new Error("Task cancelled");
        }
        signal.addEventListener("abort", onAbort, { once: true });

        try {
            const raw = await call.get();
            const buf = toBuffer(raw);
            const fileKey = await saveFile(buf, "wav", task.taskId);

            return {
                success: true,
                file_key: fileKey,
                file_keys: [fileKey],
            };
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };

    registerHandler("gpu", "qwen-tts3-design", handler);
}

export function registerQwen3TtsReferenceT2sHandler(): void {
    const handler: TaskHandler = async (
        task: TaskData,
        signal: AbortSignal,
    ) => {
        const p = task.prompt ?? {};

        const text = typeof p.text === "string" ? p.text.trim() : "";
        const ref_audio =
            typeof (p as Record<string, unknown>).audio === "string"
                ? ((p as Record<string, unknown>).audio as string).trim()
                : typeof (p as Record<string, unknown>).ref_audio === "string"
                  ? ((p as Record<string, unknown>).ref_audio as string).trim()
                  : "";
        const ref_text =
            typeof (p as Record<string, unknown>).ref_text === "string"
                ? ((p as Record<string, unknown>).ref_text as string).trim()
                : typeof (p as Record<string, unknown>).reference_text ===
                    "string"
                  ? (
                        (p as Record<string, unknown>).reference_text as string
                    ).trim()
                  : "";
        const languageRaw = (p as Record<string, unknown>).language;
        const language =
            languageRaw === undefined ? "Auto" : mapLanguage(languageRaw);

        const xVectorOnlyRaw = (p as Record<string, unknown>).x_vector_only;
        const x_vector_only =
            typeof xVectorOnlyRaw === "boolean"
                ? xVectorOnlyRaw
                : typeof xVectorOnlyRaw === "string"
                  ? xVectorOnlyRaw.trim().toLowerCase() === "true"
                  : false;

        const maxNewTokensRaw = (p as Record<string, unknown>).max_new_tokens;
        const max_new_tokens =
            typeof maxNewTokensRaw === "number"
                ? Math.floor(maxNewTokensRaw)
                : Number(maxNewTokensRaw) > 0
                  ? Math.floor(Number(maxNewTokensRaw))
                  : 2048;

        if (!text) return { success: false, error: "Missing text" };
        if (!ref_audio)
            return { success: false, error: "Missing reference audio" };

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_REFERENCE);
        const instance = await cls.instance();
        const generate = instance.method("generate");

        const call = await generate.spawn([], {
            text,
            ref_audio,
            ref_text,
            language,
            x_vector_only,
            max_new_tokens: Math.min(4096, Math.max(256, max_new_tokens)),
        });

        const onAbort = () => {
            call.cancel({}).catch(() => {});
        };

        if (signal.aborted) {
            onAbort();
            throw new Error("Task cancelled");
        }
        signal.addEventListener("abort", onAbort, { once: true });

        try {
            const raw = await call.get();
            const buf = toBuffer(raw);
            const fileKey = await saveFile(buf, "wav", task.taskId);

            return {
                success: true,
                file_key: fileKey,
                file_keys: [fileKey],
            };
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };

    registerHandler("gpu", "qwen-tts3-reference", handler);
}
