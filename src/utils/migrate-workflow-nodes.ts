import type { Node } from "@xyflow/react";

const LEGACY_UNIFIED_TYPE = "textGenSpeechNode";
const LEGACY_GEN_SPEECH_FEATURE = "gen_speech";

/** ABI / registry slot for preset TTS (replaces gen_speech). */
export const TEXT_GEN_SPEECH_PRESET_SLOT = "text_gen_speech_preset";

const LEGACY_PLUGIN_ID_MAP: Record<string, string> = {
    "tongflow-llm-gemini": "tongflow-llm-gemini-text",
    "tongflow-llm-openai": "tongflow-llm-openai-text",
    "tongflow-llm-openrouter-free": "tongflow-llm-openrouter-free",
    "openrouter-free": "tongflow-llm-openrouter-free",
    "tongflow-modal-Qwen3-ASR": "tongflow-modal-qwen3asr",
    "tongflow-modal-cpu-crawl4ai-app": "tongflow-modal-crawl4ai",
    "tongflow-modal-cpu-docling": "tongflow-modal-docling",
    "tongflow-modal-cpu-ffmpeg": "tongflow-modal-ffmpeg",
    "tongflow-modal-cpu-paddle": "tongflow-modal-paddle",
    "tongflow-modal-cpu-pyscenedetect": "tongflow-modal-pyscenedetect",
    "tongflow-modal-cpu-whisper": "tongflow-modal-whisper",
    "tongflow-modal-gpu-ace-step": "tongflow-modal-ace-step",
    "tongflow-modal-gpu-color-fix-lab": "tongflow-modal-color-fix-lab",
    "tongflow-modal-gpu-color_fix_lab": "tongflow-modal-color-fix-lab",
    "tongflow-modal-gpu-ernie-image": "tongflow-modal-ernie-image",
    "tongflow-modal-gpu-flux2-klein9b": "tongflow-modal-flux2-klein9b",
    "tongflow-modal-gpu-gemma4": "tongflow-modal-gemma4",
    "tongflow-modal-gpu-ltx": "tongflow-modal-ltx",
    "tongflow-modal-gpu-qwen3asr": "tongflow-modal-qwen3asr",
    "tongflow-modal-gpu-qwen3tts": "tongflow-modal-qwen3tts",
    "tongflow-modal-gpu-seedvr2": "tongflow-modal-seedvr2",
    "tongflow-modal-gpu-z-image": "tongflow-modal-z-image",
    "ace-step": "tongflow-modal-ace-step",
    "color-fix-lab": "tongflow-modal-color-fix-lab",
    "crawl4ai": "tongflow-modal-crawl4ai",
    "docling": "tongflow-modal-docling",
    "ernie-image": "tongflow-modal-ernie-image",
    "ffmpeg": "tongflow-modal-ffmpeg",
    "flux2-klein9b": "tongflow-modal-flux2-klein9b",
    "gemini-text": "tongflow-llm-gemini-text",
    "gemma4": "tongflow-modal-gemma4",
    "ltx": "tongflow-modal-ltx",
    "openai-text": "tongflow-llm-openai-text",
    "paddle": "tongflow-modal-paddle",
    "pyscenedetect": "tongflow-modal-pyscenedetect",
    "qwen3asr": "tongflow-modal-qwen3asr",
    "qwen3tts": "tongflow-modal-qwen3tts",
    "seedvr2": "tongflow-modal-seedvr2",
    "whisper": "tongflow-modal-whisper",
    "z-image": "tongflow-modal-z-image",
};

type LegacyMode = "clone" | "preset" | "describe";

function migratePluginIds(
    data: Record<string, unknown>,
): Record<string, unknown> {
    const pluginId =
        typeof data.pluginId === "string"
            ? LEGACY_PLUGIN_ID_MAP[data.pluginId]
            : undefined;
    const pluginRepo =
        typeof data.pluginRepo === "string"
            ? LEGACY_PLUGIN_ID_MAP[data.pluginRepo]
            : undefined;
    if (!pluginId && !pluginRepo) return data;
    return {
        ...data,
        ...(pluginId ? { pluginId } : {}),
        ...(pluginRepo ? { pluginRepo } : {}),
    };
}

function legacyModeFromData(data: Record<string, unknown>): LegacyMode {
    const m = data.mode;
    if (m === "preset") return "preset";
    if (m === "describe") return "describe";
    return "clone";
}

/**
 * Idempotent migrations for canvas nodes (localStorage + workflow load paths).
 */
export function migrateWorkflowNodes(nodes: Node[]): Node[] {
    return nodes.map((node) => {
        if (node.type === LEGACY_UNIFIED_TYPE) {
            const data = migratePluginIds({
                ...(node.data as Record<string, unknown>),
            });
            const mode = legacyModeFromData(data);
            delete data.mode;

            const nextType =
                mode === "preset"
                    ? "textGenSpeechPresetNode"
                    : mode === "describe"
                      ? "textGenSpeechInstructNode"
                      : "textGenSpeechCloneNode";

            const feature =
                mode === "preset"
                    ? TEXT_GEN_SPEECH_PRESET_SLOT
                    : mode === "describe"
                      ? "text_gen_speech_instruct"
                      : "text_gen_speech_clone";
            data.feature = feature;

            return { ...node, type: nextType, data };
        }

        let d = node.data as Record<string, unknown> | undefined;
        if (d) {
            d = migratePluginIds(d);
        }

        if (
            d &&
            d.feature === LEGACY_GEN_SPEECH_FEATURE &&
            node.type === "textGenSpeechPresetNode"
        ) {
            return {
                ...node,
                data: { ...d, feature: TEXT_GEN_SPEECH_PRESET_SLOT },
            };
        }

        if (d && d !== node.data) {
            return { ...node, data: d };
        }

        return node;
    });
}
