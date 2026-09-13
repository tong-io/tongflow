/**
 * Static ABI registry keyed by React Flow node type — the single source of
 * truth for "which ABI slot does this node type implement, and how are its
 * inputs sourced".
 *
 * `NODE_TYPE_TO_ABI_FEATURE` maps a node type to its ABI feature slot;
 * `NODE_TYPE_SOURCE_SPEC` carries the per-type `sourceSpec` overrides. Both
 * are consumed headlessly (exporter, connection validation, agent tools) and
 * by the canvas components (`useAbiForm` / `useAbiExecution` / `AbiHandles`),
 * so a workflow exports identically whether or not any component is mounted.
 *
 * Every ABI node component (`nodes/{transfer,compose,batch,decompose}/`) must
 * have an entry here; modality / add / data nodes are intentionally omitted —
 * they're not ABI-driven.
 */

import { isModalityNode } from "../constants/modality-nodes";
import type { NodeSlot } from "../generated/abi/index";

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
    imagePoseNode: "image-pose",
    imageBodySegNode: "image-body-seg",
    imageNormalNode: "image-normal",
    imageMattingNode: "image-matting",
    videoGenModelNode: "video-gen-model",
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
    audioDescribeNode: "audio-describe",
    imageGenTextNode: "image-gen-text",
    videoGenTextNode: "video-gen-text",
    videoGenTextSpeechRecognizeNode: "transcribe",
    audioGenTextSpeechRecognizeNode: "transcribe",
    fileGenTextNode: "parse-document",
    linkGenTextNode: "link",
    getFirstFrameNode: "get-first-frame",
    getLastFrameNode: "get-last-frame",
    musicRepaintNode: "music-repaint",
    musicExtractNode: "music-extract",
    musicLegoNode: "music-lego",
    musicCompleteNode: "music-complete",

    // batch/
    dropVideoNode: "drop-video",
    arrangeNode: "arrange-group",
    concatVideoNode: "concat-videos",

    // compose/
    mergeVideoAudioNode: "merge-video-audio",
    audioVideoLipSyncNode: "audio-video-lip-sync",
    imageFusionNode: "image-fusion",
    imagesGenVideoNode: "images-gen-video",
    refsGenVideoNode: "refs-gen-video",
    speechImageGenVideoNode: "audio-image-gen-video",
    speechTextGenVideoNode: "speech-text-gen-video",
    speechVideoGenVideoNode: "speech-video-gen-video",
    videoImageGenVideoMixNode: "video-image-gen-video-mix",
    videoImageGenVideoMoveNode: "video-image-gen-video-move",
    imageImageGenVideoNode: "image-image-gen-video",
    textAudioGenSpeechNode: "text-audio-gen-speech",
    textsGenTextNode: "combine-text",
    concatVideoComposeNode: "concat-videos",
    musicCoverNode: "music-cover",

    // decompose/
    splitVideoNode: "split-video",
    splitTextNode: "split-text",
    musicBriefNode: "music-brief",
    separateSoundNode: "separate-sound",
};

export function featureForNodeType(
    nodeType: string | undefined,
): NodeSlot | undefined {
    if (!nodeType) return undefined;
    return NODE_TYPE_TO_ABI_FEATURE[nodeType];
}

/**
 * Per-node-type `sourceSpec` overrides. Types absent here use the bare ABI
 * topology (`resolveSpec(feature, {})`).
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
    // Style prompt + lyrics can come from upstream text nodes (e.g. the
    // island's audio + two texts combo) or be typed into the node.
    musicCoverNode: {
        text: handle({ nodeType: "textNode", path: "texts[0]", manual: true }),
        lyrics: handle({
            nodeType: "textNode",
            path: "texts[0]",
            manual: true,
        }),
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
    // Omni-reference video generation: three parallel collect arrays, one per
    // media kind (nodeType is inferred from the field names).
    refsGenVideoNode: {
        images: collectAll(),
        videos: collectAll(),
        audios: collectAll(),
        text: handle({ nodeType: "textNode", path: "texts[0]", manual: true }),
        duration: configField(),
    },
    arrangeNode: { fileKeys: collectAll({ nodeType: "videoNode" }) },
    audioDescribeNode: { audio: batchOn() },
    audioGenTextSpeechRecognizeNode: { audio: batchOn() },
    concatVideoComposeNode: { videos: collectAll() },
    concatVideoNode: { videos: collectAll() },
    convertVoiceNode: { sourceKey: batchOn({ nodeType: "audioNode" }) },
    denoiseAudioSubtitleNode: { fileKey: batchOn({ nodeType: "audioNode" }) },
    dropVideoNode: { videos: collectAll() },
    extractAudioNode: { video: batchOn() },
    fileGenTextNode: { document: batchOn({ nodeType: "fileNode" }) },
    genTextNode: {
        text: batchOn({ nodeType: "textNode", path: "texts" }),
    },
    getFirstFrameNode: { video: batchOn() },
    getLastFrameNode: { video: batchOn() },
    imageBodySegNode: { image: batchOn() },
    imageGenImageUpscaleNode: { image: batchOn() },
    imageGenModelNode: { image: batchOn() },
    imageGenTextNode: { image: batchOn() },
    imageMattingNode: { image: batchOn() },
    imageNormalNode: { image: batchOn() },
    imagePoseNode: { image: batchOn() },
    mergeVideoAudioNode: { video: batchOn() },
    removeVideoAudioNode: { video: batchOn() },
    removeVideoSubtitleNode: { fileKey: batchOn({ nodeType: "videoNode" }) },
    removeWatermarkNode: { fileKey: batchOn({ nodeType: "videoNode" }) },
    separateAudioTrackNode: { audio: batchOn() },
    separateSpeakerNode: { audio: batchOn() },
    speechGenVideoNode: { audio: handle({ nodeType: "audioNode" }) },
    splitTextNode: {
        text: handle({ nodeType: "textNode", path: "texts[0]" }),
    },
    splitVideoNode: { video: batchOn() },
    textAudioGenSpeechNode: {
        text: batchOn({ nodeType: "textNode", path: "texts" }),
    },
    textGenImageNode: {
        text: batchOn({ nodeType: "textNode", path: "texts" }),
    },
    textGenMusicNode: {
        tags: handle({ nodeType: "textNode", path: "texts[0]" }),
        lyrics: handle({ nodeType: "textNode", path: "texts[0]" }),
    },
    textGenSpeechCloneNode: {
        text: batchOn({ nodeType: "textNode", path: "texts" }),
        ref_audio: configField(),
    },
    textGenSpeechInstructNode: {
        text: batchOn({ nodeType: "textNode", path: "texts" }),
    },
    textGenSpeechPresetNode: {
        text: batchOn({ nodeType: "textNode", path: "texts" }),
    },
    textsGenTextNode: { texts: collectAll() },
    videoGenModelNode: { video: batchOn() },
    videoGenTextNode: { video: batchOn() },
    videoGenTextSpeechRecognizeNode: {
        audio: batchOn({ nodeType: "videoNode" }),
    },
    videoUpscaleNode: { video: batchOn() },
    // `url` is a plain string (not a $ref), so force it to a linkNode-sourced
    // handle instead of the default config/text classification. batchOn fans
    // out one extraction per URL stored in the linkNode's `texts`.
    linkGenTextNode: {
        url: batchOn({ nodeType: "linkNode", path: "texts" }),
    },
    // `text` is a plain string; promote it to a textNode-sourced handle so an
    // upstream text node can feed the music brief idea.
    musicBriefNode: {
        text: handle({ nodeType: "textNode", path: "texts[0]" }),
    },
    // `text` describes the sound to isolate; it can be fed from an upstream
    // textNode or typed manually in the node (edge wins, textarea fallback).
    separateSoundNode: {
        audio: handle({ nodeType: "audioNode" }),
        text: handle({ nodeType: "textNode", path: "texts[0]", manual: true }),
    },
};

/** True when `nodeType` implements an ABI slot (i.e. is an executable node). */
export function isAbiNodeType(nodeType: string | undefined): boolean {
    return !!nodeType && nodeType in NODE_TYPE_TO_ABI_FEATURE;
}

/** ABI feature + sourceSpec overrides for a node type. */
export interface AbiNodeSpec {
    feature: NodeSlot;
    sourceSpec: Record<string, FieldSourceOverride>;
}

/**
 * Feature + sourceSpec overrides for `nodeType`, or `undefined` when the type
 * is not ABI-driven (data / add / modality nodes).
 */
export function abiSpecForNodeType(
    nodeType: string | undefined,
): AbiNodeSpec | undefined {
    const feature = featureForNodeType(nodeType);
    if (!feature || !nodeType) return undefined;
    return { feature, sourceSpec: NODE_TYPE_SOURCE_SPEC[nodeType] ?? {} };
}

/** sourceSpec overrides for `nodeType` (empty when it has none). */
export function sourceSpecForNodeType(
    nodeType: string | undefined,
): Record<string, FieldSourceOverride> {
    return (nodeType && NODE_TYPE_SOURCE_SPEC[nodeType]) || {};
}

const resolvedSpecCache = new Map<string, ResolvedSpec>();

/**
 * Fully resolved (default-merged) spec for `nodeType`, or `undefined` when the
 * type is not ABI-driven. Memoized per type — the tables are static.
 */
export function resolvedSpecForNodeType(
    nodeType: string | undefined,
): ResolvedSpec | undefined {
    if (!nodeType) return undefined;
    const cached = resolvedSpecCache.get(nodeType);
    if (cached) return cached;
    const abi = abiSpecForNodeType(nodeType);
    if (!abi) return undefined;
    const spec = resolveSpec(abi.feature, abi.sourceSpec);
    resolvedSpecCache.set(nodeType, spec);
    return spec;
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
