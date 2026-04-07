/**
 * SeedVR2（Modal GPU）— 图片 / 视频高清放大
 *
 * 对应 ``modal/gpu/seedvr2.py``：App ``seedvr2``，Cls ``Inference``，方法 ``upsample_image`` / ``upsample_video``。
 *
 * 部署：``modal deploy modal/gpu/seedvr2.py``
 *
 * Prompt（可选字段）：
 * - ``resolution``: ``"1k"`` | ``"2k"`` | ``"4k"``（默认 ``2k``）；与 ComfyUI SeedVR2 节点一致（短边目标 + 单边上限），见 ``modal/gpu/seedvr2.py`` 中 ``TIER_COMFY_RESOLUTION``
 * - ``seed``: 数字（默认 ``42``，与 Comfy 节点一致）
 * - ``dit_variant``: ``"ema"`` | ``"sharp"``（默认 ``sharp``）；需已下载对应 ``.pth``
 * - ``color_correction``: ``"lab"`` | ``"none"``（默认 ``lab``）
 * - 视频：``out_fps`` 覆盖输出帧率
 * - 环境（Modal 镜像）：``SEEDVR2_MODEL_SIZE`` ``3b`` | ``7b``（默认 ``3b``）；``SEEDVR2_TENSOR_OFFLOAD``（默认 ``1``）；``SEEDVR2_TORCH_COMPILE``（默认 ``0``，与 Comfy 示例一致可设为 ``1``）
 * - 视频：``batch_size``（默认 ``33``）、``uniform_batch_size``（默认 ``true``）、``temporal_overlap``（默认 ``3``）；低显存可 ``batch_size: 1``
 */

import type { TaskData, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";
import { getR2Url } from "@/lib/r2-utils";
import { ModalClient } from "modal";
import { fetchModalAssetBytes } from "./fetch-modal-asset";

const APP_NAME = "seedvr2";
const CLS_NAME = "Inference";

function toBuffer(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (typeof raw === "string") return Buffer.from(raw, "base64");
    throw new Error("Unexpected Modal return type for media bytes");
}

function pickResolution(
    p: Record<string, unknown>,
): "1k" | "2k" | "4k" {
    const r = p.resolution;
    if (r === "1k" || r === "2k" || r === "4k") return r;
    return "2k";
}

function pickSeed(p: Record<string, unknown>): number {
    const s = Number((p as { seed?: unknown }).seed);
    return Number.isFinite(s) ? s : 42;
}

function pickDitVariant(p: Record<string, unknown>): "ema" | "sharp" {
    const v = p.dit_variant;
    if (v === "sharp" || v === "ema") return v;
    return "sharp";
}

function pickColorCorrection(p: Record<string, unknown>): "lab" | "none" {
    const v = p.color_correction;
    if (v === "none" || v === "lab") return v;
    return "lab";
}

export function registerSeedvr2UpscaleHandlers(): void {
    const imageHandler: TaskHandler = async (
        task: TaskData,
        signal: AbortSignal,
    ) => {
        const p = task.prompt as Record<string, unknown>;
        let imageUrl = typeof p.image === "string" ? p.image : "";
        if (!imageUrl && typeof p.fileKey === "string") {
            imageUrl = getR2Url(p.fileKey);
        }
        if (!imageUrl) {
            return { success: false, error: "Missing image" };
        }
        const bytes = await fetchModalAssetBytes(imageUrl);

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_NAME);
        const instance = await cls.instance();
        const upsample = instance.method("upsample_image");

        const call = await upsample.spawn([], {
            image: bytes,
            resolution: pickResolution(p),
            seed: pickSeed(p),
            dit_variant: pickDitVariant(p),
            color_correction: pickColorCorrection(p),
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
            const fileKey = await saveFile(buf, "png", task.taskId);
            return {
                success: true,
                file_key: fileKey,
                file_keys: [fileKey],
            };
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };

    const videoHandler: TaskHandler = async (
        task: TaskData,
        signal: AbortSignal,
    ) => {
        const p = task.prompt as Record<string, unknown>;
        let videoUrl = typeof p.video === "string" ? p.video : "";
        if (!videoUrl && typeof p.fileKey === "string") {
            videoUrl = getR2Url(p.fileKey);
        }
        if (!videoUrl) {
            return { success: false, error: "Missing video" };
        }
        const bytes = await fetchModalAssetBytes(videoUrl);

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_NAME);
        const instance = await cls.instance();
        const upsample = instance.method("upsample_video");

        const outFpsRaw = (p as { out_fps?: unknown }).out_fps;
        const outFps =
            outFpsRaw !== undefined && Number.isFinite(Number(outFpsRaw))
                ? Number(outFpsRaw)
                : undefined;

        const bsRaw = (p as { batch_size?: unknown }).batch_size;
        const batchSize =
            bsRaw !== undefined && Number.isFinite(Number(bsRaw))
                ? Number(bsRaw)
                : undefined;
        const uniformBatch =
            typeof (p as { uniform_batch_size?: unknown })
                .uniform_batch_size === "boolean"
                ? (p as { uniform_batch_size: boolean }).uniform_batch_size
                : undefined;
        const ovRaw = (p as { temporal_overlap?: unknown }).temporal_overlap;
        const temporalOverlap =
            ovRaw !== undefined && Number.isFinite(Number(ovRaw))
                ? Number(ovRaw)
                : undefined;

        const kwargs: Record<string, unknown> = {
            video: bytes,
            resolution: pickResolution(p),
            seed: pickSeed(p),
            dit_variant: pickDitVariant(p),
            color_correction: pickColorCorrection(p),
        };
        if (outFps !== undefined) kwargs.out_fps = outFps;
        if (batchSize !== undefined) kwargs.batch_size = batchSize;
        if (uniformBatch !== undefined) kwargs.uniform_batch_size = uniformBatch;
        if (temporalOverlap !== undefined)
            kwargs.temporal_overlap = temporalOverlap;

        const call = await upsample.spawn([], kwargs);

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
            return {
                success: true,
                file_key: fileKey,
                file_keys: [fileKey],
            };
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };

    registerHandler("gpu", "seedvr2-image-upscale", imageHandler);
    registerHandler("gpu", "seedvr2-video-upscale", videoHandler);
}
