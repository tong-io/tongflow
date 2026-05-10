import type { Node } from "@xyflow/react";

const LEGACY_UNIFIED_TYPE = "textGenSpeechNode";
const LEGACY_GEN_SPEECH_FEATURE = "gen_speech";

/** ABI / registry slot for preset TTS (replaces gen_speech). */
export const TEXT_GEN_SPEECH_PRESET_SLOT = "text-gen-speech-preset";

type LegacyMode = "clone" | "preset" | "describe";

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
            const data = { ...(node.data as Record<string, unknown>) };
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
                      ? "text-gen-speech-instruct"
                      : "text-gen-speech-clone";
            data.feature = feature;

            return { ...node, type: nextType, data };
        }

        const d = node.data as Record<string, unknown> | undefined;
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

        return node;
    });
}
