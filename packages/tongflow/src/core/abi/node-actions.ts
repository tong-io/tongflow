/**
 * Which ABI nodes a canvas selection can feed.
 *
 * The contextual action toolbar ("generate video", "edit image", …) used to be
 * a hand-written chain of `if (counts.imageNode === 1 && counts.textNode === 1)`
 * branches. That table had to be extended by hand for every new slot, and a
 * slot nobody remembered to wire up simply had no entry point — silently.
 *
 * Here the *matching* is derived instead: every ABI node type already declares,
 * through its resolved spec, which upstream modality each input handle takes,
 * whether it is an array, and whether the ABI requires it. A selection matches
 * a node type when
 *
 *  1. every selected node can be consumed by some handle (capacity), and
 *  2. every required handle that the form can't supply on its own is covered.
 *
 * Rule 2 is what separates the single-node and compose variants of one slot:
 * `imageGenVideoNode` takes its prompt from the form (`text: configField()`),
 * so one image alone matches it; `imageGenVideoComposeNode` takes the prompt
 * from a handle, so it needs an image *and* a text node.
 *
 * What stays hand-written is what the ABI does not know: the label, the order
 * buttons appear in, and product caps that are not schema facts (a reference
 * array is unbounded in the ABI, but the models behind `refs-gen-video` take
 * at most 9 images / 3 clips / 3 audio).
 */

import type { NodeSlot } from "../generated/abi/index";
import type { DataNodeType } from "./handle-introspect";
import {
    NODE_TYPE_TO_ABI_FEATURE,
    resolvedSpecForNodeType,
} from "./node-feature-registry";

/** How many nodes of each modality the selection holds. */
export type SelectionCounts = Partial<Record<DataNodeType, number>>;

/** Inclusive `[min, max]`; `max` may be `Infinity`. */
export type Range = readonly [number, number];

export interface NodeActionMeta {
    /** i18n key under `Workspace.smartIsland`. */
    label: string;
    /** Ascending sort order within a toolbar. */
    order: number;
    /** Product caps the ABI doesn't express, per modality. */
    limits?: Partial<Record<DataNodeType, Range>>;
    /** Cap on image + video + audio nodes combined. */
    totalMedia?: Range;
    /**
     * Modalities accepted in place of another one. A 3D model node feeds the
     * image handles of `image-gen-text` / `image-gen-video` — the canvas
     * renders a preview frame for it.
     */
    aliases?: Partial<Record<DataNodeType, DataNodeType>>;
    /**
     * Acts on the files *inside* one grouped node (a video node holding
     * several clips), not on a multi-node selection.
     */
    groupOnly?: boolean;
    /** Needs at least this many selected nodes. */
    minNodes?: number;
}

export interface NodeActionCandidate {
    nodeType: string;
    feature: NodeSlot;
    label: string;
    order: number;
}

const MEDIA_TYPES: readonly DataNodeType[] = [
    "imageNode",
    "videoNode",
    "audioNode",
];

/**
 * Per-node-type presentation + caps. Every ABI node type must appear here (a
 * vitest guard fails otherwise) so a new slot can't quietly end up without an
 * entry point. Order groups by the modality a button hangs off: text 100s,
 * image 200s, video 300s, audio 400s, document/link/model 500s, combos 600s.
 */
export const NODE_ACTION_META: Readonly<Record<string, NodeActionMeta>> = {
    // ── from text ────────────────────────────────────────────────────────
    splitTextNode: { label: "splitText", order: 100 },
    genTextNode: { label: "generateText", order: 110 },
    textGenImageNode: { label: "generateImage", order: 120 },
    // gen-music requires nothing in the ABI (lyrics and tags both optional),
    // so pin it to the selections that actually read as a song brief.
    textGenMusicNode: {
        label: "generateMusic",
        order: 130,
        limits: { textNode: [1, 2] },
    },
    textGenAudioNode: { label: "generateAudio", order: 135 },
    textGenSpeechCloneNode: { label: "textToSpeechClone", order: 140 },
    textGenSpeechPresetNode: { label: "textToSpeechPreset", order: 150 },
    textGenSpeechInstructNode: { label: "textToSpeechInstruct", order: 160 },
    textGenVideoNode: { label: "generateVideo", order: 170 },
    musicBriefNode: { label: "musicBrief", order: 180 },
    textsGenTextNode: {
        label: "rewriteText",
        order: 190,
        limits: { textNode: [2, Number.POSITIVE_INFINITY] },
    },

    // ── from image ───────────────────────────────────────────────────────
    imageGenTextNode: {
        label: "describeReverse",
        order: 200,
        aliases: { modelNode: "imageNode" },
    },
    imageGenVideoNode: {
        label: "generateVideo",
        order: 210,
        aliases: { modelNode: "imageNode" },
    },
    imageGenVideoComposeNode: { label: "generateVideo", order: 211 },
    imageGenImageNode: { label: "editImage", order: 220 },
    imageGenImageUpscaleNode: { label: "upscale", order: 230 },
    imageGenModelNode: { label: "generate3D", order: 240 },
    imagePoseNode: { label: "detectPose", order: 250 },
    imageBodySegNode: { label: "segmentBody", order: 260 },
    imageNormalNode: { label: "estimateNormal", order: 270 },
    imageMattingNode: { label: "extractForeground", order: 280 },
    // Gemini 3 Pro takes up to 14 reference images.
    imageFusionNode: {
        label: "imageFusion",
        order: 290,
        limits: { imageNode: [2, 14] },
    },
    // Seedance multimodal reference accepts up to 9 images.
    imagesGenVideoNode: {
        label: "imagesGenVideo",
        order: 291,
        limits: { imageNode: [2, 9] },
    },
    imageImageGenVideoNode: {
        label: "firstLastFrameVideo",
        order: 292,
        limits: { imageNode: [2, 2] },
    },

    // ── from video ───────────────────────────────────────────────────────
    videoGenTextNode: { label: "describeReverse", order: 300 },
    videoGenTextSpeechRecognizeNode: { label: "speechRecognize", order: 310 },
    videoUpscaleNode: { label: "upscale", order: 320 },
    videoGenModelNode: { label: "captureMotion", order: 330 },
    videoEditNode: { label: "editVideo", order: 340 },
    extractAudioNode: { label: "extractAudioTrack", order: 350 },
    removeVideoAudioNode: { label: "removeVideoAudio", order: 360 },
    removeWatermarkNode: { label: "removeWatermark", order: 365 },
    removeVideoSubtitleNode: { label: "removeSubtitle", order: 366 },
    splitVideoNode: { label: "slice", order: 370 },
    getFirstFrameNode: { label: "firstFrame", order: 380 },
    getLastFrameNode: { label: "lastFrame", order: 390 },
    dropVideoNode: { label: "filter", order: 391, groupOnly: true },
    arrangeNode: { label: "arrange", order: 392, groupOnly: true },
    concatVideoNode: { label: "concat", order: 393, groupOnly: true },
    concatVideoComposeNode: { label: "concat", order: 394, minNodes: 2 },

    // ── from audio ───────────────────────────────────────────────────────
    audioDescribeNode: { label: "describeReverse", order: 400 },
    audioGenTextSpeechRecognizeNode: { label: "speechRecognize", order: 410 },
    separateAudioTrackNode: { label: "separateAudio", order: 420 },
    separateSpeakerNode: { label: "separateSpeaker", order: 430 },
    separateSoundNode: { label: "separateSound", order: 440 },
    denoiseAudioSubtitleNode: { label: "denoise", order: 450 },
    convertVoiceNode: { label: "convertVoice", order: 460 },
    musicRepaintNode: { label: "repaintMusic", order: 470 },
    musicCoverNode: { label: "coverMusic", order: 480 },
    musicExtractNode: { label: "extractStem", order: 490 },
    musicLegoNode: { label: "addTrack", order: 491 },
    musicCompleteNode: { label: "completeMusic", order: 492 },

    // ── from a document / link ───────────────────────────────────────────
    fileGenTextNode: { label: "parseDocument", order: 500 },
    linkGenTextNode: { label: "extractContent", order: 510 },

    // ── cross-modality combinations ──────────────────────────────────────
    audioVideoLipSyncNode: { label: "lipSync", order: 600 },
    mergeVideoAudioNode: { label: "merge", order: 610 },
    speechVideoGenVideoNode: { label: "lipDub", order: 620 },
    videoImageGenVideoMoveNode: { label: "videoTransfer", order: 630 },
    videoImageGenVideoMixNode: { label: "characterReplace", order: 640 },
    speechImageGenVideoNode: { label: "generateVideo", order: 650 },
    speechTextGenVideoNode: { label: "generateVideo", order: 660 },
    speechGenVideoNode: { label: "generateVideo", order: 661 },
    textAudioGenSpeechNode: { label: "speakWithStyle", order: 670 },
    textGenSpeechCloneComposeNode: { label: "cloneVoice", order: 680 },
    // Omni-reference, matching MiniMax-H3 Ref2VA: 9 images, 3 clips, 3 audio,
    // 12 reference files in total.
    refsGenVideoNode: {
        label: "refsGenVideo",
        order: 690,
        // One reference on its own is just image/video/audio → video; the
        // omni-reference node earns its place once there are two to mix.
        minNodes: 2,
        limits: {
            imageNode: [0, 9],
            videoNode: [0, 3],
            audioNode: [0, 3],
            textNode: [0, 1],
        },
        totalMedia: [1, 12],
    },
};

/** Per-modality capacity of a node type's input handles. */
interface Capacity {
    /** How many selected nodes of this modality the handles can take. */
    max: number;
    /** How many the ABI requires the selection to supply. */
    min: number;
}

function capacities(nodeType: string): Record<string, Capacity> | undefined {
    const spec = resolvedSpecForNodeType(nodeType);
    if (!spec) return undefined;
    const caps: Record<string, Capacity> = {};
    for (const field of spec.topology.inputOrder) {
        const f = spec.fields[field];
        if (f?.kind !== "handle") continue;
        const cap = caps[f.nodeType] ?? { max: 0, min: 0 };
        caps[f.nodeType] = cap;
        // An array / collect-all handle absorbs any number of upstream nodes;
        // a scalar handle (including a batchOn-promoted one) takes exactly one.
        const multi = f.array || f.collect === true;
        cap.max = multi ? Number.POSITIVE_INFINITY : cap.max + 1;
        // `manual` fields double as form widgets, so the user can fill them in
        // after the node lands — they don't have to come from the selection.
        if (f.required && !f.manual) cap.min = Math.max(cap.min, 1);
    }
    return caps;
}

/** Fold aliased modalities into the modality they stand in for. */
function applyAliases(
    counts: SelectionCounts,
    aliases: NodeActionMeta["aliases"],
): SelectionCounts {
    if (!aliases) return counts;
    const out: SelectionCounts = { ...counts };
    for (const [from, to] of Object.entries(aliases) as Array<
        [DataNodeType, DataNodeType]
    >) {
        const n = out[from];
        if (!n) continue;
        out[to] = (out[to] ?? 0) + n;
        delete out[from];
    }
    return out;
}

function withinLimits(counts: SelectionCounts, meta: NodeActionMeta): boolean {
    for (const [type, range] of Object.entries(meta.limits ?? {}) as Array<
        [DataNodeType, Range]
    >) {
        const n = counts[type] ?? 0;
        if (n < range[0] || n > range[1]) return false;
    }
    if (meta.totalMedia) {
        const total = MEDIA_TYPES.reduce((sum, t) => sum + (counts[t] ?? 0), 0);
        if (total < meta.totalMedia[0] || total > meta.totalMedia[1])
            return false;
    }
    return true;
}

export interface SelectionOptions {
    /**
     * The one selected node holds several files (or several texts), so
     * actions that operate within a group — filter, arrange, concat — apply.
     */
    group?: boolean;
}

/**
 * Node types the given selection can be turned into, ordered for display.
 *
 * `counts` holds only modality nodes — the caller drops processing nodes and
 * `add*` nodes before calling, since neither carries an output to feed.
 */
export function nodeActionsForSelection(
    counts: SelectionCounts,
    options: SelectionOptions = {},
): NodeActionCandidate[] {
    const total = Object.values(counts).reduce<number>(
        (sum, n) => sum + (n ?? 0),
        0,
    );
    const out: NodeActionCandidate[] = [];
    for (const [nodeType, meta] of Object.entries(NODE_ACTION_META)) {
        if (meta.groupOnly && !(options.group && total === 1)) continue;
        if (meta.minNodes && total < meta.minNodes) continue;
        const caps = capacities(nodeType);
        if (!caps) continue;
        const effective = applyAliases(counts, meta.aliases);
        if (!withinLimits(effective, meta)) continue;

        const modalities = new Set<string>([
            ...Object.keys(caps),
            ...Object.keys(effective),
        ]);
        let ok = true;
        for (const modality of modalities) {
            const n = effective[modality as DataNodeType] ?? 0;
            const cap = caps[modality] ?? { max: 0, min: 0 };
            // Every selected node needs a handle to land on, and every
            // handle the ABI insists on needs a node to fill it.
            if (n > cap.max || n < cap.min) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;

        const feature = NODE_TYPE_TO_ABI_FEATURE[nodeType];
        if (!feature) continue;
        out.push({ nodeType, feature, label: meta.label, order: meta.order });
    }
    return out.sort((a, b) => a.order - b.order);
}
