/**
 * FLUX.2 Klein 9B 多图参考融合 / 编辑（Modal GPU）
 *
 * 对应 modal/gpu/flux2_klein9b.py：`Inference.edit_multi`（**Klein 9B KV** + `denoise_cached`）。
 * 节点「图片融合」eco：`prompt: { fileKeys: url[], text, width?, height? }`（fileKeys 已由 getR2Url 展开为 URL）。
 *
 * 官方推理代码未写死「最多几张」：`encode_image_refs` 会拼接任意张参考图；多图时每张会先 cap 到约 1024² 像素。
 * 此处用 `MAX_REF_IMAGES` 防止参考过多导致显存爆掉（可按部署调大）。
 */

import type { TaskData, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";
import { ModalClient } from "modal";
import { fetchModalAssetBytes } from "./fetch-modal-asset";

const APP_NAME = "flux2-klein-9b";
const CLS_NAME = "Inference";

/** 与 L40S + offload 相匹配的保守上限；需要更多时可提高并换更大显存 / klein-9b-kv */
const MAX_REF_IMAGES = 12;

function toBuffer(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (typeof raw === "string") return Buffer.from(raw, "base64");
    throw new Error("Unexpected Modal return type for image bytes");
}

function pickText(p: Record<string, unknown>): string {
    const t =
        (typeof p.text === "string" && p.text) ||
        (typeof p.prompt === "string" && p.prompt) ||
        "";
    return t.trim();
}

export function registerFlux2Klein9bFusionHandler(): void {
    const handler: TaskHandler = async (
        task: TaskData,
        signal: AbortSignal,
    ) => {
        const p = task.prompt as Record<string, unknown>;
        const text = pickText(p);

        const rawKeys = p.fileKeys;
        const urls = Array.isArray(rawKeys)
            ? rawKeys.map((u) => String(u))
            : [];

        if (urls.length < 2) {
            return {
                success: false,
                error: "Image fusion needs at least 2 reference images",
            };
        }
        if (!text) {
            return { success: false, error: "Missing fusion prompt" };
        }
        if (urls.length > MAX_REF_IMAGES) {
            return {
                success: false,
                error: `Too many reference images (max ${MAX_REF_IMAGES})`,
            };
        }

        const imageBuffers = await Promise.all(
            urls.map((u) => fetchModalAssetBytes(u)),
        );

        const width = Number((p as { width?: unknown }).width);
        const height = Number((p as { height?: unknown }).height);
        const w =
            Number.isFinite(width) && width > 0 ? Math.round(width) : 1360;
        const h =
            Number.isFinite(height) && height > 0 ? Math.round(height) : 768;

        const seedRaw = (p as { seed?: unknown }).seed;
        const seed =
            seedRaw !== undefined && Number.isFinite(Number(seedRaw))
                ? Number(seedRaw)
                : undefined;

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_NAME);
        const instance = await cls.instance();
        const editMulti = instance.method("edit_multi");

        const kwargs: Record<string, unknown> = {
            prompt: text,
            images: imageBuffers,
            width: w,
            height: h,
        };
        if (seed !== undefined) kwargs.seed = seed;

        const call = await editMulti.spawn([], kwargs);

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
                prompt: text,
            };
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };

    registerHandler("gpu", "flux2-klein9b-fusion", handler);
}
