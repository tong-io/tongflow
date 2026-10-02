/**
 * TongFlow's node grammar: every canvas node type belongs to one of six
 * categories, which is also the directory its component lives in under
 * `packages/tongflow/src/canvas/nodes/`. The agent is taught this grammar
 * (see `nodeCatalog`) so the workflows it writes are shaped the way TongFlow
 * expects. A drift test checks this table against `node-types.tsx`.
 *
 *   add        user-input widgets (upload / type on the canvas) — canvas only
 *   modality   one asset each: text · image · video · audio · file · 3D model · link
 *   transfer   1 → 1 executable (image → video, text → image, video → text …)
 *   compose    N → 1 executable (audio + video → lip-synced video, images → video …)
 *   decompose  1 → N executable (video → clips, text → lines, mix → stems …)
 *   batch      N → 1 grouping (arrange, drop)
 */
export type NodeCategory =
    | "add"
    | "modality"
    | "transfer"
    | "compose"
    | "decompose"
    | "batch";

export const NODE_CATEGORY_ORDER: readonly NodeCategory[] = [
    "add",
    "modality",
    "transfer",
    "compose",
    "decompose",
    "batch",
];

export const NODE_TYPE_CATEGORY: Readonly<Record<string, NodeCategory>> = {
    // add/
    addImageNode: "add",
    addTextNode: "add",
    addAudioNode: "add",
    addVideoNode: "add",
    addLinkNode: "add",
    addFileNode: "add",
    addModelNode: "add",
    // modality/
    imageNode: "modality",
    textNode: "modality",
    videoNode: "modality",
    audioNode: "modality",
    fileNode: "modality",
    modelNode: "modality",
    linkNode: "modality",
    // transfer/
    imageGenVideoNode: "transfer",
    textGenVideoNode: "transfer",
    imageGenModelNode: "transfer",
    imagePoseNode: "transfer",
    imageBodySegNode: "transfer",
    imageNormalNode: "transfer",
    imageMattingNode: "transfer",
    videoGenModelNode: "transfer",
    speechGenVideoNode: "transfer",
    imageGenImageNode: "transfer",
    imageGenImageUpscaleNode: "transfer",
    genTextNode: "transfer",
    textGenImageNode: "transfer",
    textGenMusicNode: "transfer",
    textGenAudioNode: "transfer",
    textGenSpeechCloneNode: "transfer",
    textGenSpeechPresetNode: "transfer",
    textGenSpeechInstructNode: "transfer",
    removeVideoSubtitleNode: "transfer",
    videoUpscaleNode: "transfer",
    videoEditNode: "transfer",
    removeWatermarkNode: "transfer",
    extractAudioNode: "transfer",
    removeVideoAudioNode: "transfer",
    denoiseAudioSubtitleNode: "transfer",
    separateAudioTrackNode: "transfer",
    separateSpeakerNode: "transfer",
    convertVoiceNode: "transfer",
    audioDescribeNode: "transfer",
    imageGenTextNode: "transfer",
    videoGenTextNode: "transfer",
    videoGenTextSpeechRecognizeNode: "transfer",
    audioGenTextSpeechRecognizeNode: "transfer",
    fileGenTextNode: "transfer",
    linkGenTextNode: "transfer",
    getFirstFrameNode: "transfer",
    getLastFrameNode: "transfer",
    musicRepaintNode: "transfer",
    musicExtractNode: "transfer",
    musicLegoNode: "transfer",
    musicCompleteNode: "transfer",
    // compose/
    imageGenVideoComposeNode: "compose",
    textGenSpeechCloneComposeNode: "compose",
    concatVideoNode: "compose",
    mergeVideoAudioNode: "compose",
    audioVideoLipSyncNode: "compose",
    imageFusionNode: "compose",
    imagesGenVideoNode: "compose",
    refsGenVideoNode: "compose",
    speechImageGenVideoNode: "compose",
    speechTextGenVideoNode: "compose",
    speechVideoGenVideoNode: "compose",
    videoImageGenVideoMixNode: "compose",
    videoImageGenVideoMoveNode: "compose",
    imageImageGenVideoNode: "compose",
    textAudioGenSpeechNode: "compose",
    textsGenTextNode: "compose",
    concatVideoComposeNode: "compose",
    musicCoverNode: "compose",
    // decompose/
    splitVideoNode: "decompose",
    splitTextNode: "decompose",
    musicBriefNode: "decompose",
    separateSoundNode: "decompose",
    // batch/
    dropVideoNode: "batch",
    arrangeNode: "batch",
};

export function categoryOf(nodeType: string): NodeCategory | undefined {
    return NODE_TYPE_CATEGORY[nodeType];
}
