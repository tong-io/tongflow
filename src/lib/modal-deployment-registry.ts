/**
 * Maps task handler (feature type + function) to how we probe Modal for a deployment.
 * Keep in sync with src/handlers/modal/* and MODAL_FUNCTIONS in configs.ts.
 */

import { MODAL_FUNCTIONS } from "@/handlers/modal/configs";

export type ModalProbe =
    | { kind: "function"; appName: string; name: string }
    | { kind: "cls"; appName: string; name: string };

export interface ModalHandlerProbeRow {
    type: string;
    function: string;
    probe: ModalProbe;
}

function fn(
    appName: string,
    name: string,
): { kind: "function"; appName: string; name: string } {
    return { kind: "function", appName, name };
}

function cls(
    appName: string,
    name: string,
): { kind: "cls"; appName: string; name: string } {
    return { kind: "cls", appName, name };
}

/** GPU / extra handlers not generated from MODAL_FUNCTIONS alone */
const GPU_AND_EXTRA: ModalHandlerProbeRow[] = [
    { type: "gpu", function: "zimage-t2i", probe: cls("zimage-turbo", "Inference") },
    {
        type: "gpu",
        function: "flux2-klein9b-edit",
        probe: cls("flux2-klein-9b", "Inference"),
    },
    {
        type: "gpu",
        function: "flux2-klein9b-fusion",
        probe: cls("flux2-klein-9b", "Inference"),
    },
    { type: "gpu", function: "ltx2-t2v", probe: cls("ltx-video", "Inference") },
    { type: "gpu", function: "ltx2-i2v", probe: cls("ltx-video", "Inference") },
    {
        type: "gpu",
        function: "ltx2-ii2v-first-last",
        probe: cls("ltx-video", "Inference"),
    },
    {
        type: "gpu",
        function: "qwen-tts3-design",
        probe: cls("qwen3-tts", "Design"),
    },
    {
        type: "gpu",
        function: "qwen-tts3-reference",
        probe: cls("qwen3-tts", "Reference"),
    },
    {
        type: "gpu",
        function: "seedvr2-image-upscale",
        probe: cls("seedvr2", "Inference"),
    },
    {
        type: "gpu",
        function: "seedvr2-video-upscale",
        probe: cls("seedvr2", "Inference"),
    },
    {
        type: "gpu",
        function: "qwen3-asr",
        probe: cls("qwen3-asr", "Transcribe"),
    },
    {
        type: "gpu",
        function: "qwen3-asr-timestamp",
        probe: cls("qwen3-asr", "TranscribeWithTimestamps"),
    },
    { type: "gpu", function: "gemma4-i2t", probe: cls("gemma4", "Inference") },
    { type: "gpu", function: "gemma4-v2t", probe: cls("gemma4", "Inference") },
    { type: "gpu", function: "ace-step", probe: cls("ace-step", "Inference") },
];

const FROM_CONFIGS: ModalHandlerProbeRow[] = MODAL_FUNCTIONS.map((c) => ({
    type: c.type,
    function: c.function,
    probe: fn(c.appName, c.modalFunction),
}));

const REGISTRY: ModalHandlerProbeRow[] = [...FROM_CONFIGS, ...GPU_AND_EXTRA];

const KEY = (type: string, fnName: string) => `${type}::${fnName}`;

const MAP = new Map<string, ModalProbe>();
for (const row of REGISTRY) {
    MAP.set(KEY(row.type, row.function), row.probe);
}

/**
 * If this handler is backed by Modal, returns how to probe; otherwise null (no Modal check).
 */
export function getModalProbeForHandler(
    type: string,
    functionName: string,
): ModalProbe | null {
    return MAP.get(KEY(type, functionName)) ?? null;
}
