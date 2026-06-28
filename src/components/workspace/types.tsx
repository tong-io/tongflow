"use client";

/**
 * Workspace node and edge type definitions
 * Ported from the saas project; node types are added incrementally as needed
 */

import "@xyflow/react/dist/style.css";
import type { EdgeTypes, NodeTypes } from "@xyflow/react";

// Edge component
import CustomEdge from "./edges/custom-edge";
import AddAudioNode from "./nodes/add/add-audio-node";
import AddFileNode from "./nodes/add/add-file-node";
// Add nodes
import AddImageNode from "./nodes/add/add-image-node";
import AddLinkNode from "./nodes/add/add-link-node";
import { AddModelNode } from "./nodes/add/add-model-node";
import AddTextNode from "./nodes/add/add-text-node";
import AddVideoNode from "./nodes/add/add-video-node";
import ArrangeTextNode from "./nodes/batch/arrange-text";
// Batch nodes
import DropVideoNode from "./nodes/batch/drop-video";
// Compose nodes
import AudioVideoLipSyncNode from "./nodes/compose/audio-video-lip-sync";
import ConcatVideoNode from "./nodes/compose/concat-video";
import ConcatVideoComposeNode from "./nodes/compose/concat-video";
import ImageFusionNode from "./nodes/compose/image-fusion";
import ImageGenVideoComposeNode from "./nodes/compose/image-gen-video-compose";
import ImageImageGenVideoNode from "./nodes/compose/image-image-gen-video";
import ImagesGenVideoNode from "./nodes/compose/images-gen-video";
import MergeVideoAudioNode from "./nodes/compose/merge-video-audio";
import SpeechImageGenVideoNode from "./nodes/compose/speech-image-gen-video";
import SpeechTextGenVideoNode from "./nodes/compose/speech-text-gen-video";
import speechVideoGenVideoNode from "./nodes/compose/speech-video-gen-video";
import TextAudioGenSpeechNode from "./nodes/compose/text-audio-gen-speech";
import TextGenSpeechCloneComposeNode from "./nodes/compose/text-gen-speech-clone-compose";
import TextsGenTextNode from "./nodes/compose/texts-gen-text";
import VideoImageGenVideoMixNode from "./nodes/compose/video-image-gen-video-mix";
import VideoImageGenVideoMoveNode from "./nodes/compose/video-image-gen-video-move";
import SplitTextNode from "./nodes/decompose/split-text";
// Decompose nodes
import SplitVideoNode from "./nodes/decompose/split-video";
import AudioNode from "./nodes/modality/audio-node";
import FileNode from "./nodes/modality/file-node";
// Data nodes
import ImageNode from "./nodes/modality/image-node";
import ModelNode from "./nodes/modality/model-node";
import TextNode from "./nodes/modality/text-node";
import VideoNode from "./nodes/modality/video-node";
import AudioGenTextSpeechRecognizeNode from "./nodes/transfer/audio-gen-text-speech-recognize";
import ConvertVoiceNode from "./nodes/transfer/convert-voice";
import DenoiseAudioNode from "./nodes/transfer/denoise-audio";
import ExtractAudioNode from "./nodes/transfer/extract-audio";
import FileGenTextNode from "./nodes/transfer/file-gen-text";
import GetFirstFrameNode from "./nodes/transfer/get-first-frame";
import GetLastFrameNode from "./nodes/transfer/get-last-frame";
import ImageGenImageNode from "./nodes/transfer/image-gen-image";
import ImageGenImageUpscaleNode from "./nodes/transfer/image-gen-image-upscale";
import ImageGenModelNode from "./nodes/transfer/image-gen-model";
import ImageGenTextNode from "./nodes/transfer/image-gen-text";
// Transform nodes
import ImageGenVideoNode from "./nodes/transfer/image-gen-video";
import RemoveVideoSubtitleNode from "./nodes/transfer/remove-subtitle";
import RemoveVideoAudioNode from "./nodes/transfer/remove-video-audio";
import RemoveWatermarkNode from "./nodes/transfer/remove-watermark";
import SeparateAudioTrackNode from "./nodes/transfer/separate-audio-track";
import SeparateSpeakerNode from "./nodes/transfer/separate-speaker";
import SpeechGenVideoNode from "./nodes/transfer/speech-gen-video";
import TextGenImageNode from "./nodes/transfer/text-gen-image";
import TextGenMusicNode from "./nodes/transfer/text-gen-music";
import TextGenSpeechCloneNode from "./nodes/transfer/text-gen-speech-clone";
import TextGenSpeechInstructNode from "./nodes/transfer/text-gen-speech-instruct";
import TextGenSpeechPresetNode from "./nodes/transfer/text-gen-speech-preset";
import GenTextNode from "./nodes/transfer/text-gen-text";
import TextGenVideoNode from "./nodes/transfer/text-gen-video";
import VideoEditNode from "./nodes/transfer/video-edit";
import VideoGenTextNode from "./nodes/transfer/video-gen-text";
import VideoGenTextSpeechRecognizeNode from "./nodes/transfer/video-gen-text-speech-recognize";
import VideoUpscaleNode from "./nodes/transfer/video-upscale";

/**
 * Node type mapping
 * Based on the full list from the saas project
 */
export const NODE_TYPES: NodeTypes = {
    // Base data nodes - Implemented
    imageNode: ImageNode,
    textNode: TextNode,
    videoNode: VideoNode,
    audioNode: AudioNode,
    fileNode: FileNode,
    modelNode: ModelNode,

    // Add nodes - Implemented
    addImageNode: AddImageNode,
    addTextNode: AddTextNode,
    addAudioNode: AddAudioNode,
    addVideoNode: AddVideoNode,
    addLinkNode: AddLinkNode,
    addFileNode: AddFileNode,
    addModelNode: AddModelNode,

    // Transform nodes - Implemented
    imageGenVideoNode: ImageGenVideoNode,
    imageGenVideoComposeNode: ImageGenVideoComposeNode,
    textGenVideoNode: TextGenVideoNode,
    imageGenModelNode: ImageGenModelNode,
    speechGenVideoNode: SpeechGenVideoNode,
    imageGenImageNode: ImageGenImageNode,
    imageGenImageUpscaleNode: ImageGenImageUpscaleNode,
    genTextNode: GenTextNode,
    textGenImageNode: TextGenImageNode,
    textGenMusicNode: TextGenMusicNode,
    textGenSpeechCloneNode: TextGenSpeechCloneNode,
    textGenSpeechCloneComposeNode: TextGenSpeechCloneComposeNode,
    textGenSpeechPresetNode: TextGenSpeechPresetNode,
    textGenSpeechInstructNode: TextGenSpeechInstructNode,
    removeVideoSubtitleNode: RemoveVideoSubtitleNode,
    videoUpscaleNode: VideoUpscaleNode,
    videoEditNode: VideoEditNode,
    removeWatermarkNode: RemoveWatermarkNode,
    extractAudioNode: ExtractAudioNode,
    removeVideoAudioNode: RemoveVideoAudioNode,
    denoiseAudioSubtitleNode: DenoiseAudioNode,
    separateAudioTrackNode: SeparateAudioTrackNode,
    separateSpeakerNode: SeparateSpeakerNode,
    convertVoiceNode: ConvertVoiceNode,
    imageGenTextNode: ImageGenTextNode,
    videoGenTextNode: VideoGenTextNode,
    videoGenTextSpeechRecognizeNode: VideoGenTextSpeechRecognizeNode,
    audioGenTextSpeechRecognizeNode: AudioGenTextSpeechRecognizeNode,
    fileGenTextNode: FileGenTextNode,
    getFirstFrameNode: GetFirstFrameNode,
    getLastFrameNode: GetLastFrameNode,

    // Batch nodes - Implemented
    dropVideoNode: DropVideoNode,
    arrangeNode: ArrangeTextNode,
    concatVideoNode: ConcatVideoNode,

    // Compose nodes - Implemented
    mergeVideoAudioNode: MergeVideoAudioNode,
    audioVideoLipSyncNode: AudioVideoLipSyncNode,
    imageFusionNode: ImageFusionNode,
    imagesGenVideoNode: ImagesGenVideoNode,
    speechImageGenVideoNode: SpeechImageGenVideoNode,
    speechTextGenVideoNode: SpeechTextGenVideoNode,
    speechVideoGenVideoNode: speechVideoGenVideoNode,
    videoImageGenVideoMixNode: VideoImageGenVideoMixNode,
    videoImageGenVideoMoveNode: VideoImageGenVideoMoveNode,
    imageImageGenVideoNode: ImageImageGenVideoNode,
    textAudioGenSpeechNode: TextAudioGenSpeechNode,
    textsGenTextNode: TextsGenTextNode,
    concatVideoComposeNode: ConcatVideoComposeNode,
    // Decompose nodes - Implemented
    splitVideoNode: SplitVideoNode,
    splitTextNode: SplitTextNode,
};

/**
 * Edge type mapping
 */
export const EDGE_TYPES: EdgeTypes = {
    "custom-edge": CustomEdge,
};

/**
 * Node type enum
 * Used for type checking and node creation
 */
export type NodeType = keyof typeof NODE_TYPES;

/**
 * Node categories
 */
export const NODE_CATEGORIES = {
    DATA: [
        "imageNode",
        "textNode",
        "videoNode",
        "audioNode",
        "fileNode",
        "modelNode",
    ],
    ADD: [
        "addImageNode",
        "addTextNode",
        "addAudioNode",
        "addVideoNode",
        "addLinkNode",
        "addFileNode",
        "addModelNode",
    ],
    TRANSFORM: [
        "imageGenVideoNode",
        "textGenVideoNode",
        "imageGenModelNode",
        "speechGenVideoNode",
        "imageGenImageNode",
        "imageGenImageUpscaleNode",
        "genTextNode",
        "textGenImageNode",
        "textGenMusicNode",
        "textGenSpeechCloneNode",
        "textGenSpeechPresetNode",
        "textGenSpeechInstructNode",
        "removeVideoSubtitleNode",
        "removeWatermarkNode",
        "videoUpscaleNode",
        "videoEditNode",
        "extractAudioNode",
        "removeVideoAudioNode",
        "denoiseAudioSubtitleNode",
        "separateAudioTrackNode",
        "separateSpeakerNode",
        "convertVoiceNode",
        "imageGenTextNode",
        "videoGenTextNode",
        "videoGenTextSpeechRecognizeNode",
        "audioGenTextSpeechRecognizeNode",
        "fileGenTextNode",
        "getFirstFrameNode",
        "getLastFrameNode",
    ],
    BATCH: ["dropVideoNode", "arrangeNode", "concatVideoNode"],
    COMPOSE: [
        "mergeVideoAudioNode",
        "audioVideoLipSyncNode",
        "imageFusionNode",
        "imagesGenVideoNode",
        "speechImageGenVideoNode",
        "speechTextGenVideoNode",
        "speechVideoGenVideoNode",
        "videoImageGenVideoMoveNode",
        "videoImageGenVideoMixNode",
        "imageImageGenVideoNode",
        "textAudioGenSpeechNode",
        "textGenSpeechCloneComposeNode",
        "imageGenVideoComposeNode",
        "textsGenTextNode",
        "concatVideoComposeNode",
    ],
    DECOMPOSE: ["splitVideoNode", "splitTextNode"],
} as const;
