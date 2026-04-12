/**
 * LTX-2 (Modal GPU) - Text/Image to Video
 *
 * 对应 modal/gpu/ltx.py：App `ltx-video`，Cls `Inference`。
 *
 * - ltx2-t2v: `generate` — prompt: { text, width, height, duration }
 * - ltx2-i2v: `generate` — prompt: { image, text, width, height, duration }
 * - ltx2-ii2v-first-last: 同上 `generate`，额外传 end_image（与 image 一起为首尾帧）
 * - ltx2-a2v: `InferenceA2V.generate_a2v` — prompt: { audio, text, width, height, duration, image? }
 */

import type { TaskData, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";
import { ModalClient } from "modal";
import { fetchModalAssetBytes } from "./fetch-modal-asset";

const APP_NAME = "ltx-video";
const CLS_NAME = "Inference";
const CLS_A2V_NAME = "InferenceA2V";
const DEFAULT_FPS = 24;

function toBuffer(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (typeof raw === "string") return Buffer.from(raw, "base64");
    throw new Error("Unexpected Modal return type for video bytes");
}

function pickText(p: Record<string, unknown>): string {
    const t =
        (typeof p.text === "string" && p.text) ||
        (typeof p.prompt === "string" && p.prompt) ||
        "";
    return t.trim();
}

function pickNumber(
    p: Record<string, unknown>,
    key: string,
    fallback: number,
): number {
    const v = Number((p as any)[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
}

function durationToFrames(durationSec: number, fps: number): number {
    // Let Python side align to 8*k+1; we just pass a reasonable estimate.
    return Math.max(1, Math.round(durationSec * fps));
}

function createLtxHandler(kind: "t2v" | "i2v"): TaskHandler {
    return async (task: TaskData, signal: AbortSignal) => {
        const p = task.prompt as Record<string, unknown>;
        const text = pickText(p);
        const width = pickNumber(p, "width", 1280);
        const height = pickNumber(p, "height", 704);
        const duration = pickNumber(p, "duration", 10);
        const fps = pickNumber(p, "fps", DEFAULT_FPS);
        const seed = Number.isFinite(Number((p as any).seed))
            ? Number((p as any).seed)
            : 42;

        if (!text) return { success: false, error: "Missing prompt text" };

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_NAME);
        const instance = await cls.instance();
        const generate = instance.method("generate");

        const args: Record<string, unknown> = {
            prompt: text,
            width,
            height,
            seed,
            frame_rate: fps,
            num_frames: durationToFrames(duration, fps),
        };

        if (kind === "i2v") {
            const imageUrl = typeof p.image === "string" ? p.image : "";
            if (!imageUrl)
                return { success: false, error: "Missing image url" };
            args.image = await fetchModalAssetBytes(imageUrl);
        }

        const call = await generate.spawn([], args);

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
            const fileKey = await saveFile(buf, "mp4", task.taskId);
            return { success: true, file_key: fileKey, file_keys: [fileKey] };
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };
}

function createLtxFirstLastHandler(): TaskHandler {
    return async (task: TaskData, signal: AbortSignal) => {
        const p = task.prompt as Record<string, unknown>;
        const text = pickText(p);
        const width = pickNumber(p, "width", 1280);
        const height = pickNumber(p, "height", 704);
        const duration = pickNumber(p, "duration", 10);
        const fps = pickNumber(p, "fps", DEFAULT_FPS);
        const seed = Number.isFinite(Number((p as any).seed))
            ? Number((p as any).seed)
            : 42;

        if (!text) return { success: false, error: "Missing prompt text" };

        const startUrl =
            (typeof p.start_image === "string" && p.start_image) ||
            (typeof (p as any).startImage === "string" && (p as any).startImage) ||
            "";
        const endUrl =
            (typeof p.end_image === "string" && p.end_image) ||
            (typeof (p as any).endImage === "string" && (p as any).endImage) ||
            "";
        if (!startUrl || !endUrl) {
            return {
                success: false,
                error: "Missing start_image or end_image url",
            };
        }

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_NAME);
        const instance = await cls.instance();
        const generate = instance.method("generate");

        const args: Record<string, unknown> = {
            prompt: text,
            width,
            height,
            seed,
            frame_rate: fps,
            num_frames: durationToFrames(duration, fps),
            image: await fetchModalAssetBytes(startUrl),
            end_image: await fetchModalAssetBytes(endUrl),
        };

        const call = await generate.spawn([], args);

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
            const fileKey = await saveFile(buf, "mp4", task.taskId);
            return { success: true, file_key: fileKey, file_keys: [fileKey] };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (
                msg.includes("end_image") &&
                msg.includes("unexpected keyword argument")
            ) {
                throw new Error(
                    "Modal ltx-video is out of date: redeploy modal/gpu/ltx.py (first/last frame needs Inference.generate with end_image). " +
                        msg,
                );
            }
            throw e;
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };
}

function createLtxA2vHandler(): TaskHandler {
    return async (task: TaskData, signal: AbortSignal) => {
        const p = task.prompt as Record<string, unknown>;
        const text = pickText(p);
        const audioUrl = typeof p.audio === "string" ? p.audio : "";
        const width = pickNumber(p, "width", 1280);
        const height = pickNumber(p, "height", 704);
        const duration = pickNumber(p, "duration", 10);
        const fps = pickNumber(p, "fps", DEFAULT_FPS);
        const seed = Number.isFinite(Number((p as any).seed))
            ? Number((p as any).seed)
            : 42;
        const numInferenceSteps = pickNumber(p, "num_inference_steps", 30);

        if (!text) return { success: false, error: "Missing prompt text" };
        if (!audioUrl)
            return { success: false, error: "Missing audio url" };

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_A2V_NAME);
        const instance = await cls.instance();
        const generateA2v = instance.method("generate_a2v");

        const args: Record<string, unknown> = {
            prompt: text,
            audio: await fetchModalAssetBytes(audioUrl),
            width,
            height,
            seed,
            frame_rate: fps,
            num_frames: durationToFrames(duration, fps),
            num_inference_steps: numInferenceSteps,
        };

        const imageUrl =
            (typeof p.image === "string" && p.image) ||
            (typeof (p as any).start_image === "string" && (p as any).start_image) ||
            "";
        if (imageUrl) {
            args.image = await fetchModalAssetBytes(imageUrl);
        }

        const call = await generateA2v.spawn([], args);

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
            const fileKey = await saveFile(buf, "mp4", task.taskId);
            return { success: true, file_key: fileKey, file_keys: [fileKey] };
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };
}

export function registerLtx2VideoHandlers(): void {
    registerHandler("gpu", "ltx2-t2v", createLtxHandler("t2v"));
    registerHandler("gpu", "ltx2-i2v", createLtxHandler("i2v"));
    registerHandler("gpu", "ltx2-ii2v-first-last", createLtxFirstLastHandler());
    registerHandler("gpu", "ltx2-a2v", createLtxA2vHandler());
}
