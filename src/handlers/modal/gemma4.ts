/**
 * Gemma 4 (Modal GPU) — multimodal text generation
 *
 * Python: modal/gpu/gemma4.py — App `gemma4`, class `Inference`, method `generate`.
 *
 * Deploy (once per environment):
 *   cd openflow && modal deploy modal/gpu/gemma4.py
 * First-time model weights (shared Volume `models`):
 *   modal run modal/gpu/gemma4.py::download
 */

import type { TaskData, TaskHandler, HandlerResult } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { ModalClient } from "modal";
import { fetchModalAssetBytes } from "./fetch-modal-asset";

const APP_NAME = "gemma4";
const CLS_NAME = "Inference";

const DEFAULT_IMAGE_PROMPT = "Describe this image in detail.";
const DEFAULT_VIDEO_PROMPT = "Describe this video in detail.";

function pickUserText(
    p: Record<string, unknown>,
    fallback: string,
): string {
    const t =
        (typeof p.text === "string" && p.text.trim()) ||
        (typeof p.prompt === "string" && p.prompt.trim()) ||
        "";
    return t || fallback;
}

function parseGemmaResult(raw: unknown): { text: string; thinking: string } {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        const text = typeof o.text === "string" ? o.text : "";
        const thinking = typeof o.thinking === "string" ? o.thinking : "";
        return { text, thinking };
    }
    return { text: "", thinking: "" };
}

async function callInferenceGenerate(
    userPrompt: string,
    mediaKwargs: Record<string, unknown>,
    signal: AbortSignal,
): Promise<{ text: string; thinking: string }> {
    const client = new ModalClient();
    const cls = await client.cls.fromName(APP_NAME, CLS_NAME);
    const instance = await cls.instance();
    const generate = instance.method("generate");

    // Modal spawn(args, kwargs): first array maps to positional params after `self`.
    // Passing `prompt` only in kwargs can yield "unexpected keyword argument 'prompt'"
    // on the worker; align with generate(self, prompt: str, ...).
    const call = await generate.spawn([userPrompt], mediaKwargs);

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
        return parseGemmaResult(raw);
    } finally {
        signal.removeEventListener("abort", onAbort);
    }
}

function createGemma4I2tHandler(): TaskHandler {
    return async (task: TaskData, signal: AbortSignal): Promise<HandlerResult> => {
        const p = task.prompt as Record<string, unknown>;
        const imageUrl =
            (typeof p.image === "string" && p.image) ||
            (typeof p.imageUrl === "string" && p.imageUrl) ||
            "";
        if (!imageUrl) return { success: false, error: "Missing image URL" };

        const userPrompt = pickUserText(p, DEFAULT_IMAGE_PROMPT);
        const imgBytes = await fetchModalAssetBytes(imageUrl);

        const { text, thinking } = await callInferenceGenerate(
            userPrompt,
            { images: [imgBytes] },
            signal,
        );

        if (!text) return { success: false, error: "Empty model response" };
        return {
            success: true,
            text,
            ...(thinking ? { thinking } : {}),
        };
    };
}

function createGemma4V2tHandler(): TaskHandler {
    return async (task: TaskData, signal: AbortSignal): Promise<HandlerResult> => {
        const p = task.prompt as Record<string, unknown>;
        const videoUrl =
            (typeof p.video === "string" && p.video) ||
            (typeof p.videoUrl === "string" && p.videoUrl) ||
            "";
        if (!videoUrl) return { success: false, error: "Missing video URL" };

        const userPrompt = pickUserText(p, DEFAULT_VIDEO_PROMPT);
        const videoBytes = await fetchModalAssetBytes(videoUrl);

        const { text, thinking } = await callInferenceGenerate(
            userPrompt,
            { video: videoBytes },
            signal,
        );

        if (!text) return { success: false, error: "Empty model response" };
        return {
            success: true,
            text,
            ...(thinking ? { thinking } : {}),
        };
    };
}

export function registerGemma4Handlers(): void {
    registerHandler("gpu", "gemma4-i2t", createGemma4I2tHandler());
    registerHandler("gpu", "gemma4-v2t", createGemma4V2tHandler());
}
