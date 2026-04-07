/**
 * ACE-Step 文本生成音乐（Modal GPU）
 *
 * 对应 modal/gpu/ace_step.py：App `ace-step`，Cls `Inference`，方法 `generate`。
 * 节点 textGenMusicNode（tags / lyrics / duration / language / keyscale / bpm）。
 */

import type { TaskData, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { saveFile } from "@/handlers/file-utils";
import { ModalClient } from "modal";

const APP_NAME = "ace-step";
const CLS_NAME = "Inference";

function toBuffer(raw: unknown): Buffer {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (typeof raw === "string") return Buffer.from(raw, "base64");
    throw new Error("Unexpected Modal return type for audio bytes");
}

function mapVocalLanguage(lang: unknown): string {
    if (typeof lang !== "string" || !lang.trim()) return "unknown";
    if (lang === "cantonese") return "yue";
    return lang;
}

export function registerAceStepT2sHandler(): void {
    const handler: TaskHandler = async (
        task: TaskData,
        signal: AbortSignal,
    ) => {
        const p = task.prompt;

        const tags = typeof p.tags === "string" ? p.tags.trim() : "";
        const lyrics = typeof p.lyrics === "string" ? p.lyrics.trim() : "";
        /** Style / caption for ACE-Step — maps to Modal `tags` → GenerationParams.caption */
        const styleTags =
            tags ||
            (typeof p.caption === "string" && p.caption.trim()) ||
            (typeof p.text === "string" && p.text.trim()) ||
            "";

        const durationRaw = p.duration;
        const durationSec =
            typeof durationRaw === "number"
                ? durationRaw
                : Number(durationRaw) || 120;

        const vocalLanguage = mapVocalLanguage(p.language);
        const keyscale =
            typeof p.keyscale === "string" && p.keyscale.trim()
                ? p.keyscale.trim()
                : "C major";

        let bpm: number | undefined;
        if (p.bpm !== undefined && p.bpm !== null && p.bpm !== "") {
            const n = Number(p.bpm);
            if (!Number.isNaN(n) && n > 0) bpm = n;
        }

        const seedRaw = p.seed;
        const seed =
            typeof seedRaw === "number"
                ? seedRaw
                : Number(seedRaw) > 0
                  ? Number(seedRaw)
                  : 42;

        if (!styleTags && !lyrics) {
            return { success: false, error: "Missing style (tags) and lyrics" };
        }

        const client = new ModalClient();
        const cls = await client.cls.fromName(APP_NAME, CLS_NAME);
        const instance = await cls.instance();
        const generate = instance.method("generate");

        const call = await generate.spawn([], {
            tags: styleTags || "instrumental music",
            lyrics: lyrics || "[Instrumental]",
            duration: Math.min(600, Math.max(10, durationSec)),
            language: vocalLanguage,
            keyscale,
            ...(bpm !== undefined ? { bpm } : {}),
            seed,
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
            const fileKey = await saveFile(buf, "flac", task.taskId);

            return {
                success: true,
                file_key: fileKey,
                file_keys: [fileKey],
            };
        } finally {
            signal.removeEventListener("abort", onAbort);
        }
    };

    registerHandler("gpu", "ace-step", handler);
}
