/**
 * 视频切片（PySceneDetect）— 与 ffmpeg-cpu 一致：
 * 入参 fetchModalAssetByFileKey → video_bytes；Modal 返回 outputs[] 每段 output_bytes，落盘为 fileKey。
 */

import path from "node:path";

import type { TaskData, HandlerResult, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";
import { ModalClient } from "modal";

import { fetchModalAssetByFileKey } from "./fetch-modal-asset";

function toBuffer(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (typeof raw === "string") return Buffer.from(raw, "base64");
    throw new Error("Unexpected Modal return type for file bytes");
}

async function persistSplitVideoResult(
    task: TaskData,
    raw: HandlerResult,
): Promise<HandlerResult> {
    const r = raw as Record<string, unknown>;
    if (r.success === false) return raw;

    if (Array.isArray(r.outputs)) {
        const keys: string[] = [];
        for (const item of r.outputs) {
            if (!item || typeof item !== "object") continue;
            const o = item as Record<string, unknown>;
            const buf = toBuffer(o.output_bytes);
            const ext = String(o.output_ext ?? "mp4").replace(/^\./, "");
            keys.push(await saveFile(buf, ext, task.taskId));
        }
        if (keys.length === 0) {
            return {
                success: false,
                error: "split_video: no output segments",
            };
        }
        const originalKey = String(
            r.original_key ??
                (task.prompt as Record<string, unknown>).fileKey ??
                "",
        );
        return {
            success: true,
            split_keys: keys,
            original_key: originalKey,
            file_keys: keys,
        };
    }

    if (Array.isArray(r.split_keys)) {
        return raw;
    }

    return { success: false, error: "Unexpected split_video Modal result" };
}

const splitVideoHandler: TaskHandler = async (
    task: TaskData,
    signal: AbortSignal,
) => {
    const fk = String((task.prompt as Record<string, unknown>).fileKey ?? "");
    if (!fk.trim()) {
        return { success: false, error: "Missing fileKey" };
    }

    let prompt: Record<string, unknown>;
    try {
        const video_bytes = await fetchModalAssetByFileKey(fk);
        prompt = {
            ...(task.prompt as Record<string, unknown>),
            video_bytes,
            video_filename: path.basename(fk),
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, error: msg };
    }

    const client = new ModalClient();
    const fn = await client.functions.fromName("scenedetect", "split_video");
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
                const persisted = await persistSplitVideoResult(task, result);
                resolve(persisted);
            })
            .catch((err: Error) => {
                signal.removeEventListener("abort", onAbort);
                reject(err);
            });
    });
};

export function registerScenedetectCpuHandlers(): void {
    registerHandler("cpu", "scenedetect", splitVideoHandler);
}
