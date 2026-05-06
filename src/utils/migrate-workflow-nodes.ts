import type { Node } from "@xyflow/react";

import { normalizeLegacyPluginId } from "@/lib/legacy-plugin-id-map";
import { canonicalizeNodeSlot } from "@/lib/legacy-slot-map";

const LEGACY_UNIFIED_TYPE = "textGenSpeechNode";
const LEGACY_GEN_SPEECH_FEATURE = "gen_speech";

/** ABI / registry slot for preset TTS (replaces gen_speech). */
export const TEXT_GEN_SPEECH_PRESET_SLOT = "text-gen-speech-preset";

type LegacyMode = "clone" | "preset" | "describe";

function migratePluginIds(
    data: Record<string, unknown>,
): Record<string, unknown> {
    let touched = false;
    const next = { ...data };
    if (typeof data.pluginId === "string") {
        const n = normalizeLegacyPluginId(data.pluginId);
        if (n !== data.pluginId) {
            next.pluginId = n;
            touched = true;
        }
    }
    if (typeof data.pluginRepo === "string") {
        const n = normalizeLegacyPluginId(data.pluginRepo);
        if (n !== data.pluginRepo) {
            next.pluginRepo = n;
            touched = true;
        }
    }
    return touched ? next : data;
}

function legacyModeFromData(data: Record<string, unknown>): LegacyMode {
    const m = data.mode;
    if (m === "preset") return "preset";
    if (m === "describe") return "describe";
    return "clone";
}

function canonicalizeNodeDataFeatures(node: Node): Node {
    const d = node.data as Record<string, unknown> | undefined;
    if (!d) return node;
    const next = { ...d };
    let touched = false;
    if (typeof next.feature === "string") {
        const c = canonicalizeNodeSlot(next.feature);
        if (c !== next.feature) {
            next.feature = c;
            touched = true;
        }
    }
    if (typeof next.nodeSlot === "string") {
        const c = canonicalizeNodeSlot(next.nodeSlot);
        if (c !== next.nodeSlot) {
            next.nodeSlot = c;
            touched = true;
        }
    }
    return touched ? { ...node, data: next } : node;
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
                      ? "text-gen-speech-instruct"
                      : "text-gen-speech-clone";
            data.feature = feature;

            return canonicalizeNodeDataFeatures({
                ...node,
                type: nextType,
                data,
            });
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
            return canonicalizeNodeDataFeatures({
                ...node,
                data: { ...d, feature: TEXT_GEN_SPEECH_PRESET_SLOT },
            });
        }

        if (d && d !== node.data) {
            return canonicalizeNodeDataFeatures({ ...node, data: d });
        }

        return canonicalizeNodeDataFeatures(node);
    });
}
