"use client";

/**
 * Workspace 节点和边类型定义
 * 从 saas 项目移植，按需逐步添加节点类型
 */

import "@xyflow/react/dist/style.css";
import type { EdgeTypes, NodeTypes } from "@xyflow/react";

// Edge component
import CustomEdge from "./edges/custom-edge";

// Data nodes
import ImageNode from "./nodes/modal/image-node";
import TextNode from "./nodes/modal/text-node";
import VideoNode from "./nodes/modal/video-node";
import AudioNode from "./nodes/modal/audio-node";
import FileNode from "./nodes/modal/file-node";
import ModelNode from "./nodes/modal/model-node";

// Add nodes
import AddImageNode from "./nodes/add/add-image-node";
import AddTextNode from "./nodes/add/add-text-node";
import AddVideoNode from "./nodes/add/add-video-node";
import AddAudioNode from "./nodes/add/add-audio-node";
import AddLinkNode from "./nodes/add/add-link-node";
import AddFileNode from "./nodes/add/add-file-node";
import { AddModelNode } from "./nodes/add/add-model-node";

// Transform nodes
import ImageGenVideoNode from "./nodes/transfer/image-gen-video";
import TextGenVideoNode from "./nodes/transfer/text-gen-video";
import ImageGenModelNode from "./nodes/transfer/image-gen-model";
import SpeechGenVideoNode from "./nodes/transfer/speech-gen-video";
import GenTextNode from "./nodes/transfer/text-gen-text";
import TextGenImageNode from "./nodes/transfer/text-gen-image";
import ImageGenImageNode from "./nodes/transfer/image-gen-image";
import ImageGenImageUpscaleNode from "./nodes/transfer/image-gen-image-upscale";
import TextGenMusicNode from "./nodes/transfer/text-gen-music";
import TextGenSpeechNode from "./nodes/transfer/text-gen-speech";
import RemoveVideoSubtitleNode from "./nodes/transfer/remove-subtitle";
import VideoUpscaleNode from "./nodes/transfer/video-upscale";
import RemoveWatermarkNode from "./nodes/transfer/remove-watermark";
import SeparateVideoAudioNode from "./nodes/transfer/separate_video_audio";
import DenoiseAudioNode from "./nodes/transfer/denoise-audio";
import SeparateAudioTrackNode from "./nodes/transfer/separate_audio_track";
import SeparateSpeakerNode from "./nodes/transfer/separate_speaker";
import ConvertVoiceNode from "./nodes/transfer/convert-voice";
import ImageGenTextNode from "./nodes/transfer/image-gen-text";
import VideoGenTextNode from "./nodes/transfer/video-gen-text";
import VideoGenTextSpeechRecognizeNode from "./nodes/transfer/video-gen-text-speech-recognize";
import AudioGenTextSpeechRecognizeNode from "./nodes/transfer/audio-gen-text-speech-recognize";
import FileGenTextNode from "./nodes/transfer/file-gen-text";
import GetFirstFrameNode from "./nodes/transfer/get-first-frame";
import GetLastFrameNode from "./nodes/transfer/get-last-frame";

// Batch nodes
import DropVideoNode from "./nodes/batch/drop_video";
import ArrangeTextNode from "./nodes/batch/arrrange_text";
import ConcatVideoNode from "./nodes/compose/concat-video";

// Compose nodes
import MergeVideoAudioNode from "./nodes/compose/merge-video-audio";
import ImageFusionNode from "./nodes/compose/image-fusion";
import SpeechImageGenVideoNode from "./nodes/compose/speech-image-gen-video";
import SpeechTextGenVideoNode from "./nodes/compose/speech-text-gen-video";
import SpeechImageVideoGenVideoNode from "./nodes/compose/speech-image-video-gen-video";
import speechVideoGenVideoNode from "./nodes/compose/speech-video-gen-video";
import TextsGenTextNode from "./nodes/compose/texts-gen-text";
import VideoImageGenVideoMixNode from "./nodes/compose/video-image-gen-video-mix";
import VideoImageGenVideoMoveNode from "./nodes/compose/video-image-gen-video-move";
import ImageImageGenVideoNode from "./nodes/compose/image-image-gen-video";
import TextAudioGenSpeechNode from "./nodes/compose/text-audio-gen-speech";
import ConcatVideoComposeNode from "./nodes/compose/concat-video";
// Decompose nodes
import SplitVideoNode from "./nodes/decompose/split_video";
import SplitTextNode from "./nodes/decompose/split_text";

/**
 * 节点类型映射
 * 根据 saas 项目的完整列表
 */
export const NODE_TYPES: NodeTypes = {
    // 基础数据节点 - Implemented
    imageNode: ImageNode,
    textNode: TextNode,
    videoNode: VideoNode,
    audioNode: AudioNode,
    fileNode: FileNode,
    modelNode: ModelNode,

    // 添加节点 - Implemented
    addImageNode: AddImageNode,
    addTextNode: AddTextNode,
    addAudioNode: AddAudioNode,
    addVideoNode: AddVideoNode,
    addLinkNode: AddLinkNode,
    addFileNode: AddFileNode,
    addModelNode: AddModelNode,

    // 转换节点 - Implemented
    imageGenVideoNode: ImageGenVideoNode,
    textGenVideoNode: TextGenVideoNode,
    imageGenModelNode: ImageGenModelNode,
    speechGenVideoNode: SpeechGenVideoNode,
    imageGenImageNode: ImageGenImageNode,
    imageGenImageUpscaleNode: ImageGenImageUpscaleNode,
    genTextNode: GenTextNode,
    textGenImageNode: TextGenImageNode,
    textGenMusicNode: TextGenMusicNode,
    textGenSpeechNode: TextGenSpeechNode,
    removeVideoSubtitleNode: RemoveVideoSubtitleNode,
    videoUpscaleNode: VideoUpscaleNode,
    removeWatermarkNode: RemoveWatermarkNode,
    separateVideoAudioNode: SeparateVideoAudioNode,
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

    // 批处理节点 - Implemented
    dropVideoNode: DropVideoNode,
    arrangeNode: ArrangeTextNode,
    concatVideoNode: ConcatVideoNode,

    // 合成节点 - Implemented
    mergeVideoAudioNode: MergeVideoAudioNode,
    imageFusionNode: ImageFusionNode,
    speechImageGenVideoNode: SpeechImageGenVideoNode,
    speechTextGenVideoNode: SpeechTextGenVideoNode,
    speechImageVideoGenVideoNode: SpeechImageVideoGenVideoNode,
    speechVideoGenVideoNode: speechVideoGenVideoNode,
    videoImageGenVideoMixNode: VideoImageGenVideoMixNode,
    videoImageGenVideoMoveNode: VideoImageGenVideoMoveNode,
    imageImageGenVideoNode: ImageImageGenVideoNode,
    textAudioGenSpeechNode: TextAudioGenSpeechNode,
    textsGenTextNode: TextsGenTextNode,
    concatVideoComposeNode: ConcatVideoComposeNode,
    // 分解节点 - Implemented
    splitVideoNode: SplitVideoNode,
    splitTextNode: SplitTextNode,
};

/**
 * 边类型映射
 */
export const EDGE_TYPES: EdgeTypes = {
    "custom-edge": CustomEdge,
};

/**
 * 节点类型枚举
 * 用于类型检查和节点创建
 */
export type NodeType = keyof typeof NODE_TYPES;

/**
 * 节点分类
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
        "textGenSpeechNode",
        "removeVideoSubtitleNode",
        "removeWatermarkNode",
        "videoUpscaleNode",
        "separateVideoAudioNode",
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
        "imageFusionNode",
        "speechImageGenVideoNode",
        "speechTextGenVideoNode",
        "speechImageVideoGenVideoNode",
        "speechVideoGenVideoNode",
        "videoImageGenVideoMoveNode",
        "videoImageGenVideoMixNode",
        "imageImageGenVideoNode",
        "textAudioGenSpeechNode",
        "textsGenTextNode",
        "concatVideoComposeNode",
    ],
    DECOMPOSE: ["splitVideoNode", "splitTextNode"],
} as const;

export const isModalNode = (type?: string | null): boolean => {
    if (!type) return false;
    return NODE_CATEGORIES.DATA.includes(type as any);
};
