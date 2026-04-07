/**
 * FFmpeg Modal (CPU) — 与 GPU（如 qwen3tts）一致：
 * 1. 入参：fetchModalAssetByFileKey 读本地 uploads / URL，再以字节传入 Modal。
 * 2. 出参：Modal 返回 output_bytes，此处 saveFile 落盘，file_key 指向 data/uploads（/api/uploads 可访问）。
 *
 * 对应 modal/cpu/ffmpeg.py，App `ffmpeg`。
 */

import path from "node:path";

import type { TaskData, HandlerResult, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";
import { ModalClient } from "modal";

import { MODAL_FUNCTIONS } from "./configs";
import { fetchModalAssetByFileKey } from "./fetch-modal-asset";

const FFMPEG_CONFIGS = MODAL_FUNCTIONS.filter((c) => c.appName === "ffmpeg");

function toBuffer(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (typeof raw === "string") return Buffer.from(raw, "base64");
    throw new Error("Unexpected Modal return type for file bytes");
}

/**
 * Modal 返回 output_bytes + output_ext（或 separate 的 outputs[]），落盘为与 qwen3tts 相同的 file_key。
 */
async function persistFfmpegModalResult(
    task: TaskData,
    modalFunction: string,
    raw: HandlerResult,
): Promise<HandlerResult> {
    const r = raw as Record<string, unknown>;
    if (r.success === false) return raw;

    if (
        modalFunction === "separate_video_audio" &&
        Array.isArray(r.outputs)
    ) {
        const keys: string[] = [];
        for (const item of r.outputs) {
            if (!item || typeof item !== "object") continue;
            const o = item as Record<string, unknown>;
            const buf = toBuffer(o.output_bytes);
            const ext = String(o.output_ext ?? "bin").replace(/^\./, "");
            keys.push(await saveFile(buf, ext, task.taskId));
        }
        if (keys.length >= 2) {
            return {
                success: true,
                video_key: keys[0],
                audio_key: keys[1],
                file_key: keys[1],
                file_keys: keys,
            };
        }
        return {
            success: false,
            error: "separate_video_audio: expected two file outputs",
        };
    }

    if (r.output_bytes != null) {
        const buf = toBuffer(r.output_bytes);
        const ext = String(r.output_ext ?? "mp4").replace(/^\./, "");
        const fileKey = await saveFile(buf, ext, task.taskId);
        return {
            success: true,
            file_key: fileKey,
            file_keys: [fileKey],
        };
    }

    if (typeof r.file_key === "string") {
        return {
            success: false,
            error:
                "Modal 未返回 output_bytes；请重新 deploy modal/cpu/ffmpeg.py（旧版仅写 R2，本地 /api/uploads 无文件）",
        };
    }

    return { success: false, error: "Unexpected Modal ffmpeg result" };
}

async function enrichFfmpegPrompt(
    modalFunction: string,
    prompt: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const p = { ...prompt };
    switch (modalFunction) {
        case "concat_videos": {
            const keys = p.fileKeys as string[] | undefined;
            if (!keys?.length) throw new Error("Missing fileKeys");
            p.videos_bytes = await Promise.all(
                keys.map((k) => fetchModalAssetByFileKey(k)),
            );
            p.filenames = keys.map((k) => path.basename(k));
            return p;
        }
        case "concat_audios": {
            const keys = p.fileKeys as string[] | undefined;
            if (!keys?.length) throw new Error("Missing fileKeys");
            p.audios_bytes = await Promise.all(
                keys.map((k) => fetchModalAssetByFileKey(k)),
            );
            p.filenames = keys.map((k) => path.basename(k));
            return p;
        }
        case "separate_video_audio": {
            const fk = (p.fileKey as string) || "";
            if (!fk) throw new Error("Missing fileKey");
            p.video_bytes = await fetchModalAssetByFileKey(fk);
            p.video_filename = path.basename(fk);
            return p;
        }
        case "merge_video_audio": {
            const vk = (p.video_key as string) || "";
            const ak = (p.audio_key as string) || "";
            if (!vk || !ak) throw new Error("Missing video_key or audio_key");
            p.video_bytes = await fetchModalAssetByFileKey(vk);
            p.audio_bytes = await fetchModalAssetByFileKey(ak);
            p.video_filename = path.basename(vk);
            p.audio_filename = path.basename(ak);
            return p;
        }
        case "remove_audio":
        case "get_last_frame":
        case "get_first_frame": {
            const vk = (p.videoKey as string) || "";
            if (!vk) throw new Error("Missing videoKey");
            p.video_bytes = await fetchModalAssetByFileKey(vk);
            p.video_filename = path.basename(vk);
            return p;
        }
        case "extract_audio": {
            const fk = (p.fileKey as string) || "";
            if (!fk) throw new Error("Missing fileKey");
            p.video_bytes = await fetchModalAssetByFileKey(fk);
            p.video_filename = path.basename(fk);
            return p;
        }
        default:
            return p;
    }
}

function createFfmpegHandler(
    appName: string,
    modalFunction: string,
): TaskHandler {
    return async (
        task: TaskData,
        signal: AbortSignal,
    ): Promise<HandlerResult> => {
        let prompt: Record<string, unknown>;
        try {
            prompt = await enrichFfmpegPrompt(
                modalFunction,
                task.prompt as Record<string, unknown>,
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { success: false, error: msg };
        }

        const client = new ModalClient();
        const fn = await client.functions.fromName(appName, modalFunction);
        const call = await fn.spawn([
            {
                taskId: task.taskId,
                prompt,
                feature: task.feature,
                function: task.function,
            },
        ]);

        return new Promise<HandlerResult>((resolve, reject) => {
            const onAbort = () => {
                call.cancel({}).catch(() => {});
                reject(new Error("Task cancelled"));
            };
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener("abort", onAbort, { once: true });
            call
                .get()
                .then(async (result: HandlerResult) => {
                    signal.removeEventListener("abort", onAbort);
                    const persisted = await persistFfmpegModalResult(
                        task,
                        modalFunction,
                        result,
                    );
                    resolve(persisted);
                })
                .catch((err: Error) => {
                    signal.removeEventListener("abort", onAbort);
                    reject(err);
                });
        });
    };
}

export function registerFfmpegCpuHandlers(): void {
    for (const c of FFMPEG_CONFIGS) {
        registerHandler(
            c.type,
            c.function,
            createFfmpegHandler(c.appName, c.modalFunction),
        );
    }
}
