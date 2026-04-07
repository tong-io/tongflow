/**
 * Z-Image-Turbo 文生图（Modal GPU）
 *
 * 对应 modal/gpu/zimage.py：App `zimage-turbo`，Cls `Inference`，方法 `generate`。
 * 节点 text-gen-image（eco）提交 prompt: { text, width, height }。
 */

import type { TaskData, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";
import { ModalClient } from "modal";

const APP_NAME = "zimage-turbo";
const CLS_NAME = "Inference";

function toBuffer(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (typeof raw === "string") return Buffer.from(raw, "base64");
    throw new Error("Unexpected Modal return type for image bytes");
}

export function registerZimageT2iHandler(): void {
    const handler: TaskHandler = async (
        task: TaskData,
        signal: AbortSignal,
    ) => {
        const p = task.prompt;
        const text =
            (typeof p.text === "string" && p.text) ||
            (typeof p.prompt === "string" && p.prompt) ||
            "";
        const width = Number(p.width) || 1024;
        const height = Number(p.height) || 1024;

        if (!text.trim()) {
            return { success: false, error: "Missing prompt text" };
        }

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_NAME);
        const instance = await cls.instance();
        const generate = instance.method("generate");

        const call = await generate.spawn([], {
            prompt: text,
            width,
            height,
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
                prompt: text,
                width,
                height,
            };
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };

    registerHandler("gpu", "zimage-t2i", handler);
}
