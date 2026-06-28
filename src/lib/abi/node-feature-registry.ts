/**
 * Static map from React Flow node type to ABI feature slot.
 *
 * Used at graph-mutation time (`expands` / `compose` in `use-flow.ts`) to
 * compute the correct `targetHandle` / `sourceHandle` for a newly-created edge
 * *before* the spawned node mounts and self-registers via `useAbiExecution`.
 *
 * Keep this in sync with the `feature="..."` strings hard-coded in each ABI
 * node component under `src/components/workspace/nodes/{transfer,compose,batch,decompose}/`.
 * Modality / add / data nodes are intentionally omitted — they're not ABI-driven.
 */

import { isModalityNode } from "@/constants/modality-nodes";
import type { NodeSlot } from "@/generated/abi";

import {
    type DataNodeType,
    getAbiTopology,
    sourceHandleId,
    targetHandleId,
} from "./handle-introspect";
import { type ResolvedSpec, resolveSpec } from "./resolve";
import {
    batchOn,
    collectAll,
    configField,
    type FieldSourceOverride,
    handle,
} from "./sources";

export const NODE_TYPE_TO_ABI_FEATURE: Readonly<Record<string, NodeSlot>> = {
    // transfer/
    genTextNode: "gen-text",
    imageGenVideoNode: "image-gen-video",
    textGenVideoNode: "text-gen-video",
    imageGenModelNode: "image-gen-model",
    speechGenVideoNode: "speech-text-gen-video",
    imageGenImageNode: "image-edit",
    imageGenImageUpscaleNode: "image-upscale",
    textGenImageNode: "image-gen",
    textGenMusicNode: "gen-music",
    textGenSpeechCloneNode: "text-gen-speech-clone",
    textGenSpeechCloneComposeNode: "text-gen-speech-clone",
    imageGenVideoComposeNode: "image-gen-video",
    textGenSpeechPresetNode: "text-gen-speech-preset",
    textGenSpeechInstructNode: "text-gen-speech-instruct",
    removeVideoSubtitleNode: "subtitle_remove",
    videoUpscaleNode: "video-upscale",
    videoEditNode: "video-edit",
    removeWatermarkNode: "remove_watermark",
    extractAudioNode: "extract-audio",
    removeVideoAudioNode: "remove-video-audio",
    denoiseAudioSubtitleNode: "denoise_audio",
    separateAudioTrackNode: "separate_audio_track",
    separateSpeakerNode: "separate_speaker",
    convertVoiceNode: "convert_voice",
    imageGenTextNode: "image-gen-text",
    videoGenTextNode: "video-gen-text",
    videoGenTextSpeechRecognizeNode: "transcribe",
    audioGenTextSpeechRecognizeNode: "transcribe",
    fileGenTextNode: "parse-document",
    getFirstFrameNode: "get-first-frame",
    getLastFrameNode: "get-last-frame",

    // batch/
    dropVideoNode: "drop-video",
    arrangeNode: "arrange-group",
    concatVideoNode: "concat-videos",

    // compose/
    mergeVideoAudioNode: "merge-video-audio",
    audioVideoLipSyncNode: "audio-video-lip-sync",
    imageFusionNode: "image-fusion",
    imagesGenVideoNode: "images-gen-video",
    speechImageGenVideoNode: "audio-image-gen-video",
    speechTextGenVideoNode: "speech-text-gen-video",
    speechVideoGenVideoNode: "speech-video-gen-video",
    videoImageGenVideoMixNode: "video-image-gen-video-mix",
    videoImageGenVideoMoveNode: "video-image-gen-video-move",
    imageImageGenVideoNode: "image-image-gen-video",
    textAudioGenSpeechNode: "text-audio-gen-speech",
    textsGenTextNode: "combine-text",
    concatVideoComposeNode: "concat-videos",

    // decompose/
    splitVideoNode: "split-video",
    splitTextNode: "split-text",
};

export function featureForNodeType(
    nodeType: string | undefined,
): NodeSlot | undefined {
    if (!nodeType) return undefined;
    return NODE_TYPE_TO_ABI_FEATURE[nodeType];
}

/**
 * Per-node `sourceSpec` overrides used at graph-mutation time so new edges get
 * the correct `targetHandle` before the target mounts. Keep in sync with each
 * ABI node component's `sourceSpec` prop.
 */
export const NODE_TYPE_SOURCE_SPEC: Partial<
    Record<string, Record<string, FieldSourceOverride>>
> = {
    textGenVideoNode: {
        text: batchOn({ nodeType: "textNode", path: "texts" }),
    },
    imageGenVideoNode: {
        image: batchOn(),
        text: configField(),
    },
    imageGenVideoComposeNode: {
        image: batchOn(),
        text: handle({ nodeType: "textNode", path: "texts[0]" }),
    },
    imageGenImageNode: {
        image: handle({ nodeType: "imageNode" }),
        text: handle({ nodeType: "textNode", path: "texts[0]", manual: true }),
    },
    videoEditNode: {
        video: handle({ nodeType: "videoNode" }),
        text: handle({ nodeType: "textNode", path: "texts[0]", manual: true }),
    },
    speechTextGenVideoNode: {
        text: handle({ nodeType: "textNode", path: "texts[0]" }),
        audio: handle({ nodeType: "audioNode" }),
    },
    speechImageGenVideoNode: {
        image: handle({ nodeType: "imageNode" }),
        audio: handle({ nodeType: "audioNode" }),
    },
    speechVideoGenVideoNode: {
        video: handle({ nodeType: "videoNode" }),
        text: handle({ nodeType: "textNode", path: "texts[0]" }),
    },
    audioVideoLipSyncNode: {
        video: handle({ nodeType: "videoNode" }),
        audio: handle({ nodeType: "audioNode" }),
        text: configField(),
    },
    videoImageGenVideoMoveNode: {
        image: handle({ nodeType: "imageNode" }),
        video: handle({ nodeType: "videoNode" }),
        text: handle({ nodeType: "textNode", path: "texts[0]", manual: true }),
    },
    textGenSpeechCloneComposeNode: {
        text: batchOn({ nodeType: "textNode", path: "texts" }),
    },
    imageFusionNode: {
        images: collectAll(),
        text: handle({ nodeType: "textNode", path: "texts[0]", manual: true }),
    },
    imagesGenVideoNode: {
        images: collectAll(),
        text: handle({ nodeType: "textNode", path: "texts[0]", manual: true }),
        duration: configField(),
    },
};

export function resolvedSpecForNodeType(
    nodeType: string | undefined,
): ResolvedSpec | undefined {
    const feature = featureForNodeType(nodeType);
    const overrides = nodeType ? NODE_TYPE_SOURCE_SPEC[nodeType] : undefined;
    if (!feature || !overrides) return undefined;
    return resolveSpec(feature, overrides);
}

/**
 * Resolve the canonical Handle ids for a new edge that connects
 * `sourceType` → `targetType`. Mirrors what `AbiHandles` and the modality
 * components render, so `collectHandleValues` and the connection validator
 * can wire the edge correctly.
 *
 * Returns `undefined` fields when a side can't be classified; the edge is still
 * created, just with the missing handle id absent (matching prior behavior).
 *
 * **Important:** the bare ABI topology classifies plain `string` inputs as
 * `config`. Many node components upgrade those to handles via `sourceSpec`
 * (e.g. `gen-text` has `text: batchOn(...)`). If a caller has access to the
 * already-resolved spec (e.g. from `useAbiExecution`'s `specRef`), it should
 * pass `targetSpec` so the override is respected. Otherwise we fall back to
 * raw topology — sufficient for fields the ABI itself classifies as a handle
 * (arrays of strings/refs, $ref scalars), but will miss sourceSpec-only
 * promotions. The post-mount heal in `useAbiExecution` covers that case.
 *
 * For ABI targets with multiple handles of the same upstream nodeType (e.g.
 * `image-fusion` taking a batch of images), the caller can pass `usedTargetHandles`
 * so we pick the next unused field, falling back to the first match.
 */
export function resolveEdgeHandles(args: {
    sourceType: string | undefined;
    targetType: string | undefined;
    usedTargetHandles?: Set<string>;
    /** Resolved spec for the target node — preferred over raw topology. */
    targetSpec?: ResolvedSpec;
}): { sourceHandle?: string; targetHandle?: string } {
    const { sourceType, targetType, usedTargetHandles, targetSpec } = args;

    let sourceHandle: string | undefined;
    if (sourceType && isModalityNode(sourceType)) {
        sourceHandle = sourceHandleId(sourceType);
    } else if (sourceType && targetType && isModalityNode(targetType)) {
        // ABI source → modality target: pick the first ABI output whose
        // declared nodeType matches the spawned modality (e.g. gen-text
        // `text: string` → `out:text` → textNode `in:textNode`).
        const feature = featureForNodeType(sourceType);
        if (feature) {
            const output = getAbiTopology(feature).outputs.find(
                (o) => o.nodeType === targetType,
            );
            if (output) sourceHandle = sourceHandleId(output.field);
        }
    }

    let targetHandle: string | undefined;
    if (targetType && isModalityNode(targetType)) {
        targetHandle = `in:${targetType}`;
    } else if (sourceType && isModalityNode(sourceType)) {
        const upstreamNodeType = sourceType as DataNodeType;

        // Walk fields in declared input order, matching by handle nodeType.
        // Skip handles already occupied by other edges; remember the first
        // match as a fallback when every candidate is taken.
        const fieldOrder =
            targetSpec?.topology.inputOrder ??
            (targetType
                ? (() => {
                      const feature = featureForNodeType(targetType);
                      return feature ? getAbiTopology(feature).inputOrder : [];
                  })()
                : []);
        const isHandleForUpstream = (field: string): boolean => {
            if (targetSpec) {
                const f = targetSpec.fields[field];
                return f?.kind === "handle" && f.nodeType === upstreamNodeType;
            }
            if (!targetType) return false;
            const feature = featureForNodeType(targetType);
            if (!feature) return false;
            const f = getAbiTopology(feature).inputs[field];
            return f?.kind === "handle" && f.nodeType === upstreamNodeType;
        };

        let firstMatch: string | undefined;
        for (const field of fieldOrder) {
            if (!isHandleForUpstream(field)) continue;
            const handleId = targetHandleId(field);
            if (firstMatch === undefined) firstMatch = handleId;
            if (!usedTargetHandles || !usedTargetHandles.has(handleId)) {
                targetHandle = handleId;
                break;
            }
        }
        if (!targetHandle) targetHandle = firstMatch;
    }

    return { sourceHandle, targetHandle };
}
