/**
 * Qwen3-ASR (Modal GPU)
 *
 * 对应 modal/gpu/qwen3asr.py：App `qwen3-asr`，
 * - Cls `Transcribe` → 函数名 `qwen3-asr`
 * - Cls `TranscribeWithTimestamps` → 函数名 `qwen3-asr-timestamp`
 *
 * 与 flux2_klein9b 一致：先用 fetchModalAssetBytes 读本地 `/api/uploads/...` 或远程 URL，
 * 再以 `audio_bytes` + `filename` 传给 Modal（避免容器内无法解析相对路径）。
 *
 * 部署：cd openflow && modal deploy modal/gpu/qwen3asr.py
 * 模型：modal run modal/gpu/qwen3asr.py::download
 */

import type { TaskData, TaskHandler, HandlerResult } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { ModalClient } from "modal";
import { fetchModalAssetBytes } from "@/handlers/modal/fetch-modal-asset";

const APP_NAME = "qwen3-asr";

/** Basename for Modal (suffix → video vs audio path in qwen3asr.py). */
function filenameFromMediaUrl(url: string): string {
    const noQuery = url.split("?")[0];
    const parts = noQuery.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.includes(".")) return last;
    return "media.bin";
}

type TimestampItem = { text: string; start_time: number; end_time: number };

function pickMediaUrl(p: Record<string, unknown>): string {
    const audio =
        (typeof p.audio === "string" && p.audio.trim()) ||
        (typeof p.audioUrl === "string" && p.audioUrl.trim()) ||
        "";
    if (audio) return audio;
    const video =
        (typeof p.video === "string" && p.video.trim()) ||
        (typeof p.videoUrl === "string" && p.videoUrl.trim()) ||
        "";
    return video;
}

function pickContext(p: Record<string, unknown>): string {
    const t =
        (typeof p.context === "string" && p.context.trim()) ||
        (typeof p.prompt === "string" && p.prompt.trim()) ||
        (typeof p.text === "string" && p.text.trim()) ||
        "";
    return t;
}

function pickLanguage(p: Record<string, unknown>): string | undefined {
    const l = typeof p.language === "string" ? p.language.trim() : "";
    return l || undefined;
}

function pickMaxNewTokens(p: Record<string, unknown>): number {
    const n = Number((p as { max_new_tokens?: unknown }).max_new_tokens);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 4096) : 512;
}

function parseTranscribeResult(raw: unknown): {
    text: string;
    language?: string;
    time_stamps?: TimestampItem[] | null;
} {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { text: "" };
    }
    const o = raw as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text : "";
    const language = typeof o.language === "string" ? o.language : undefined;
    const ts = o.time_stamps;
    let time_stamps: TimestampItem[] | null | undefined;
    if (Array.isArray(ts)) {
        time_stamps = ts
            .map((item) => {
                if (!item || typeof item !== "object") return null;
                const it = item as Record<string, unknown>;
                const segText = typeof it.text === "string" ? it.text : "";
                const st = Number(it.start_time);
                const en = Number(it.end_time);
                if (!Number.isFinite(st) || !Number.isFinite(en)) return null;
                return { text: segText, start_time: st, end_time: en };
            })
            .filter((x): x is TimestampItem => x !== null);
    }
    return { text, language, time_stamps };
}

function formatWithTimestamps(
    fallbackText: string,
    stamps: TimestampItem[] | null | undefined,
): string {
    if (!stamps?.length) return fallbackText;
    return stamps
        .map(
            (s) =>
                `[${s.start_time.toFixed(2)}s–${s.end_time.toFixed(2)}s] ${s.text}`,
        )
        .join("\n");
}

async function callQwen3Transcribe(
    clsName: "Transcribe" | "TranscribeWithTimestamps",
    task: TaskData,
    signal: AbortSignal,
): Promise<HandlerResult> {
    const p = task.prompt as Record<string, unknown>;
    const url = pickMediaUrl(p);
    if (!url) {
        return {
            success: false,
            error: "Missing media URL (provide 'audio' or 'video')",
        };
    }

    let audioBytes: Uint8Array;
    try {
        audioBytes = await fetchModalAssetBytes(url);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, error: `Failed to load media: ${msg}` };
    }

    const context = pickContext(p);
    const language = pickLanguage(p);
    const max_new_tokens = pickMaxNewTokens(p);
    const filename = filenameFromMediaUrl(url);

    const client = new ModalClient();
    const cls = await client.cls.fromName(APP_NAME, clsName);
    const instance = await cls.instance();
    const transcribe = instance.method("transcribe");

    const kwargs: Record<string, unknown> = {
        audio_bytes: audioBytes,
        filename,
        context,
        max_new_tokens,
    };
    if (language) kwargs.language = language;

    const call = await transcribe.spawn([], kwargs);

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
        const { text, language: detectedLang, time_stamps } =
            parseTranscribeResult(raw);
        if (!text && !time_stamps?.length) {
            return { success: false, error: "Empty transcription" };
        }
        const outText =
            clsName === "TranscribeWithTimestamps"
                ? formatWithTimestamps(text, time_stamps)
                : text;
        const result: HandlerResult = {
            success: true,
            text: outText,
        };
        if (detectedLang) result.language = detectedLang;
        if (time_stamps?.length) result.time_stamps = time_stamps;
        return result;
    } finally {
        signal.removeEventListener("abort", onAbort);
    }
}

function createQwen3AsrHandler(): TaskHandler {
    return (task, signal) =>
        callQwen3Transcribe("Transcribe", task, signal);
}

function createQwen3AsrTimestampHandler(): TaskHandler {
    return (task, signal) =>
        callQwen3Transcribe("TranscribeWithTimestamps", task, signal);
}

export function registerQwen3AsrHandlers(): void {
    registerHandler("gpu", "qwen3-asr", createQwen3AsrHandler());
    registerHandler("gpu", "qwen3-asr-timestamp", createQwen3AsrTimestampHandler());
}
