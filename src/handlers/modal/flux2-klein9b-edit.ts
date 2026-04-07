/**
 * FLUX.2 Klein 9B 图片编辑（Modal GPU）
 *
 * 对应 modal/gpu/flux2_klein9b.py：App `flux2-klein-9b`，Cls `Inference`，方法 `edit`（模型为 **Klein 9B KV**）。
 * 节点「图片编辑」eco 模式：prompt: { image: url, text }。
 *
 * 部署：cd openflow && modal deploy modal/gpu/flux2_klein9b.py
 */

import type { TaskData, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";
import { ModalClient } from "modal";
import { fetchModalAssetBytes } from "./fetch-modal-asset";

const APP_NAME = "flux2-klein-9b";
const CLS_NAME = "Inference";

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

export function registerFlux2Klein9bEditHandler(): void {
    const handler: TaskHandler = async (
        task: TaskData,
        signal: AbortSignal,
    ) => {
        const p = task.prompt as Record<string, unknown>;
        const text = pickText(p);
        const imageUrl = typeof p.image === "string" ? p.image : "";

        if (!text) {
            return { success: false, error: "Missing edit instruction" };
        }
        if (!imageUrl) {
            return { success: false, error: "Missing image" };
        }

        const imageBytes = await fetchModalAssetBytes(imageUrl);

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_NAME);
        const instance = await cls.instance();
        const edit = instance.method("edit");

        const seedRaw = (p as { seed?: unknown }).seed;
        const seed =
            seedRaw !== undefined && Number.isFinite(Number(seedRaw))
                ? Number(seedRaw)
                : undefined;

        const width = Number((p as { width?: unknown }).width);
        const height = Number((p as { height?: unknown }).height);
        const hasFixedSize =
            Number.isFinite(width) &&
            width > 0 &&
            Number.isFinite(height) &&
            height > 0;

        const kwargs: Record<string, unknown> = {
            prompt: text,
            image: imageBytes,
            match_input_size: !hasFixedSize,
        };
        if (seed !== undefined) kwargs.seed = seed;
        if (hasFixedSize) {
            kwargs.width = Math.round(width);
            kwargs.height = Math.round(height);
        }

        const call = await edit.spawn([], kwargs);

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

    registerHandler("gpu", "flux2-klein9b-edit", handler);
}
