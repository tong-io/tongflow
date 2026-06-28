"use client";

/**
 * Node action menu hook
 *
 * Produces the contextual action toolbar (e.g. "split", "generate video", "fuse images")
 * shown above selected nodes. Splits its output into two render slots:
 *  - `comboActions`: for multi-select / combo-mode combinations (N→1 etc.)
 *  - `singleActions`: for a single selected node
 *
 * The caller (smart-island) decides which slot to render based on `comboMode`.
 * Returns `null` for both when no actionable combination applies.
 */

import type { Node } from "@xyflow/react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { BaseNodeData } from "@/types/nodes";

// Seedance multimodal reference (images → video) accepts up to 9 images.
const MAX_IMAGES_GEN_VIDEO = 9;

interface ButtonConfig {
    text: string;
    onClick: () => void;
    id?: string;
    nodeType?: string;
}

function ActionContainer({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-center justify-center gap-2 border border-white/20 dark:border-gray-500/30 bg-white dark:bg-zinc-800/90 h-[48px] w-max rounded-full px-4">
            {children}
        </div>
    );
}

function TextButton({ text, onClick }: { text: string; onClick?: () => void }) {
    return (
        <div
            className={cn(
                "px-3 py-1.5 cursor-pointer rounded-full text-sm font-medium flex items-center gap-1",
                "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50",
                "transition-colors duration-200",
                "active:scale-95",
                "text-gray-600 dark:text-gray-200",
                "whitespace-nowrap",
            )}
            onClick={onClick}
        >
            {text}
        </div>
    );
}

function ActionItem({ buttons }: { buttons: ButtonConfig[] }) {
    return (
        <ActionContainer>
            {buttons.map((b, i) => (
                <TextButton key={i} text={b.text} onClick={b.onClick} />
            ))}
        </ActionContainer>
    );
}

// Read `data` as BaseNodeData. React Flow types `Node["data"]` as
// `Record<string, unknown>`, so this small helper centralizes the narrowing.
function asBaseData(data: unknown): BaseNodeData {
    return (data as BaseNodeData | undefined) ?? {};
}

interface UseNodeActionsArgs {
    nodes: Node[];
    selectedNodes: Node[];
    comboMode: boolean;
    comboSelectedIds: Set<string>;
    expands: (
        nodeId: string | null,
        possibleNodes: Array<{ type: string; data?: Record<string, unknown> }>,
    ) => string[];
    compose: (newNode: { type: string; data: unknown }) => string;
    t: (key: string) => string;
}

export interface UseNodeActionsResult {
    comboActions: ReactNode | null;
    singleActions: ReactNode | null;
}

export function useNodeActions(args: UseNodeActionsArgs): UseNodeActionsResult {
    const { nodes, selectedNodes, comboSelectedIds, expands, compose, t } =
        args;

    const comboActions = useMemo<ReactNode | null>(() => {
        const ids = Array.from(comboSelectedIds);
        const types: string[] = ids
            .map((id) => nodes.find((n) => n.id === id)?.type)
            .filter((type): type is string => typeof type === "string");

        const counts: Record<string, number> = types.reduce(
            (acc, type) => {
                acc[type] = (acc[type] ?? 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        const collectFileKeys = () =>
            ids.flatMap((id) => {
                const node = nodes.find((n) => n.id === id);
                return asBaseData(node?.data).fileKeys ?? [];
            });
        const collectTexts = () =>
            ids.flatMap((id) => {
                const node = nodes.find((n) => n.id === id);
                return asBaseData(node?.data).texts ?? [];
            });

        // Multiple video nodes
        if (!types.some((type) => type !== "videoNode") && types.length > 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("mergeGroup"),
                            id: "merge-group",
                            onClick: () =>
                                compose({
                                    type: "videoNode",
                                    data: { fileKeys: collectFileKeys() },
                                }),
                        },
                        {
                            text: t("concat"),
                            id: "concat-video",
                            onClick: () =>
                                compose({
                                    type: "concatVideoComposeNode",
                                    data: { ids },
                                }),
                        },
                    ]}
                />
            );
        }
        // Multiple image nodes
        if (!types.some((type) => type !== "imageNode") && types.length > 1) {
            const buttons: ButtonConfig[] = [
                {
                    text: t("mergeGroup"),
                    id: "merge-group",
                    onClick: () =>
                        compose({
                            type: "imageNode",
                            data: { fileKeys: collectFileKeys() },
                        }),
                },
            ];

            // Gemini 3 Pro supports up to 14 reference images
            if (types.length >= 2 && types.length <= 14) {
                buttons.push({
                    text: t("imageFusion"),
                    id: "image-fusion",
                    onClick: () =>
                        compose({
                            type: "imageFusionNode",
                            data: { ids },
                        }),
                });

                if (types.length <= MAX_IMAGES_GEN_VIDEO) {
                    buttons.push({
                        text: t("imagesGenVideo"),
                        id: "images-gen-video",
                        onClick: () =>
                            compose({
                                type: "imagesGenVideoNode",
                                data: { ids },
                            }),
                    });
                }

                if (types.length === 2) {
                    buttons.push({
                        text: t("firstLastFrameVideo"),
                        id: "first-last-frame-video",
                        onClick: () =>
                            compose({
                                type: "imageImageGenVideoNode",
                                data: { ids },
                            }),
                    });
                }
            }

            return <ActionItem buttons={buttons} />;
        }
        // Multiple text nodes
        if ((counts.textNode ?? 0) > 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("mergeGroup"),
                            id: "merge-group",
                            onClick: () =>
                                compose({
                                    type: "textNode",
                                    data: { texts: collectTexts() },
                                }),
                        },
                        {
                            text: t("rewriteText"),
                            id: "text-rewrite",
                            onClick: () =>
                                compose({
                                    type: "textsGenTextNode",
                                    data: { ids },
                                }),
                        },
                        {
                            text: t("textToSpeechClone"),
                            id: "text-to-speech-clone",
                            onClick: () => {
                                const anchor = selectedNodes[0];
                                if (!anchor) return;
                                expands(
                                    anchor.id,
                                    selectedNodes.map((node) => ({
                                        type: "textGenSpeechCloneNode",
                                        data: asBaseData(node.data),
                                    })),
                                );
                            },
                        },
                        {
                            text: t("textToSpeechPreset"),
                            id: "text-to-speech-preset",
                            onClick: () => {
                                const anchor = selectedNodes[0];
                                if (!anchor) return;
                                expands(
                                    anchor.id,
                                    selectedNodes.map((node) => ({
                                        type: "textGenSpeechPresetNode",
                                        data: asBaseData(node.data),
                                    })),
                                );
                            },
                        },
                        {
                            text: t("textToSpeechInstruct"),
                            id: "text-to-speech-instruct",
                            onClick: () => {
                                const anchor = selectedNodes[0];
                                if (!anchor) return;
                                expands(
                                    anchor.id,
                                    selectedNodes.map((node) => ({
                                        type: "textGenSpeechInstructNode",
                                        data: asBaseData(node.data),
                                    })),
                                );
                            },
                        },
                    ]}
                />
            );
        }
        // Multiple audio nodes
        if (!types.some((type) => type !== "audioNode") && types.length > 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("mergeGroup"),
                            id: "merge-group",
                            onClick: () =>
                                compose({
                                    type: "audioNode",
                                    data: { fileKeys: collectFileKeys() },
                                }),
                        },
                    ]}
                />
            );
        }
        // Video + image
        if (counts.videoNode === 1 && counts.imageNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("videoTransfer"),
                            id: "video-transfer",
                            onClick: () =>
                                compose({
                                    type: "videoImageGenVideoMoveNode",
                                    data: { ids },
                                }),
                        },
                        {
                            text: t("characterReplace"),
                            id: "character-replace",
                            onClick: () =>
                                compose({
                                    type: "videoImageGenVideoMixNode",
                                    data: { ids },
                                }),
                        },
                    ]}
                />
            );
        }
        // Video + audio
        if (counts.videoNode === 1 && counts.audioNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("lipSync"),
                            id: "lip-sync",
                            onClick: () =>
                                compose({
                                    type: "audioVideoLipSyncNode",
                                    data: { ids },
                                }),
                        },
                        {
                            text: t("merge"),
                            id: "merge-video-audio",
                            onClick: () =>
                                compose({
                                    type: "mergeVideoAudioNode",
                                    data: { ids },
                                }),
                        },
                    ]}
                />
            );
        }
        // Image + audio
        if (counts.imageNode === 1 && counts.audioNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("generateVideo"),
                            id: "generate-video",
                            onClick: () =>
                                compose({
                                    type: "speechImageGenVideoNode",
                                    data: { ids },
                                }),
                        },
                    ]}
                />
            );
        }
        // Multiple images + one text (2-14 image fusion w/ prompt)
        if (
            (counts.imageNode ?? 0) >= 2 &&
            (counts.imageNode ?? 0) <= 14 &&
            counts.textNode === 1
        ) {
            const buttons: ButtonConfig[] = [
                {
                    text: t("imageFusion"),
                    id: "image-fusion",
                    onClick: () =>
                        compose({
                            type: "imageFusionNode",
                            data: { ids },
                        }),
                },
            ];
            if ((counts.imageNode ?? 0) <= MAX_IMAGES_GEN_VIDEO) {
                buttons.push({
                    text: t("imagesGenVideo"),
                    id: "images-gen-video",
                    onClick: () =>
                        compose({
                            type: "imagesGenVideoNode",
                            data: { ids },
                        }),
                });
            }
            return <ActionItem buttons={buttons} />;
        }
        // Image + text
        if (counts.imageNode === 1 && counts.textNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("editImage"),
                            id: "image-edit",
                            onClick: () =>
                                compose({
                                    type: "imageGenImageNode",
                                    data: { ids },
                                }),
                        },
                        {
                            text: t("generateVideo"),
                            id: "generate-video",
                            nodeType: "imageGenVideoComposeNode",
                            onClick: () =>
                                compose({
                                    type: "imageGenVideoComposeNode",
                                    data: { ids },
                                }),
                        },
                    ]}
                />
            );
        }
        // Text + audio
        if (counts.textNode === 1 && counts.audioNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("cloneVoice"),
                            id: "clone-voice",
                            onClick: () =>
                                compose({
                                    type: "textGenSpeechCloneComposeNode",
                                    data: { ids },
                                }),
                        },
                        {
                            text: t("generateVideo"),
                            onClick: () =>
                                compose({
                                    type: "speechTextGenVideoNode",
                                    data: { ids },
                                }),
                        },
                    ]}
                />
            );
        }
        // Text + video → LipDub (reference video + target dialogue in prompt)
        if (counts.textNode === 1 && counts.videoNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("lipDub"),
                            id: "lip-dub",
                            onClick: () =>
                                compose({
                                    type: "speechVideoGenVideoNode",
                                    data: { ids },
                                }),
                        },
                    ]}
                />
            );
        }
        return null;
    }, [nodes, selectedNodes, comboSelectedIds, expands, compose, t]);

    const singleActions = useMemo<ReactNode | null>(() => {
        if (selectedNodes.length !== 1) return null;
        const node = selectedNodes[0];
        if (!node) return null;
        const { type, id } = node;
        const data = asBaseData(node.data);

        switch (type) {
            case "textNode": {
                // Multi-text actions
                if ((data.texts?.length ?? 0) > 1) {
                    return (
                        <ActionItem
                            buttons={[
                                {
                                    text: t("split"),
                                    id: "split",
                                    onClick: () =>
                                        expands(
                                            id,
                                            (data.texts ?? []).map((text) => ({
                                                type: "textNode",
                                                data: { texts: [text] },
                                            })),
                                        ),
                                },
                                {
                                    text: t("textToSpeechClone"),
                                    id: "generate-audio-clone",
                                    onClick: () =>
                                        expands(id, [
                                            {
                                                type: "textGenSpeechCloneNode",
                                                data,
                                            },
                                        ]),
                                },
                                {
                                    text: t("textToSpeechPreset"),
                                    id: "generate-audio-preset",
                                    onClick: () =>
                                        expands(id, [
                                            {
                                                type: "textGenSpeechPresetNode",
                                                data,
                                            },
                                        ]),
                                },
                                {
                                    text: t("textToSpeechInstruct"),
                                    id: "generate-audio-instruct",
                                    onClick: () =>
                                        expands(id, [
                                            {
                                                type: "textGenSpeechInstructNode",
                                                data,
                                            },
                                        ]),
                                },
                            ]}
                        />
                    );
                }
                // Single text actions
                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("splitText"),
                                id: "split-text",
                                nodeType: "splitTextNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "splitTextNode", data },
                                    ]),
                            },
                            {
                                text: t("generateText"),
                                id: "generate-text",
                                nodeType: "genTextNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "genTextNode", data },
                                    ]),
                            },
                            {
                                text: t("generateImage"),
                                id: "generate-image",
                                nodeType: "textGenImageNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "textGenImageNode", data },
                                    ]),
                            },
                            {
                                text: t("generateMusic"),
                                id: "generate-music",
                                nodeType: "textGenMusicNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "textGenMusicNode", data },
                                    ]),
                            },
                            {
                                text: t("textToSpeechClone"),
                                id: "generate-audio-clone",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "textGenSpeechCloneNode",
                                            data,
                                        },
                                    ]),
                            },
                            {
                                text: t("textToSpeechPreset"),
                                id: "generate-audio-preset",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "textGenSpeechPresetNode",
                                            data,
                                        },
                                    ]),
                            },
                            {
                                text: t("textToSpeechInstruct"),
                                id: "generate-audio-instruct",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "textGenSpeechInstructNode",
                                            data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generateVideo"),
                                id: "generate-video-node",
                                nodeType: "textGenVideoNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "textGenVideoNode", data },
                                    ]),
                            },
                        ]}
                    />
                );
            }

            case "audioNode": {
                const audioGroupButtons: ButtonConfig[] =
                    (data.fileKeys?.length ?? 0) > 1
                        ? [
                              {
                                  text: t("split"),
                                  id: "split",
                                  onClick: () =>
                                      expands(
                                          id,
                                          (data.fileKeys ?? []).map(
                                              (fileKey) => ({
                                                  type: "audioNode",
                                                  data: { fileKeys: [fileKey] },
                                              }),
                                          ),
                                      ),
                              },
                          ]
                        : [];

                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("speechRecognize"),
                                nodeType: "audioGenTextSpeechRecognizeNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "audioGenTextSpeechRecognizeNode",
                                            data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generateVideo"),
                                nodeType: "speechGenVideoNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "speechGenVideoNode", data },
                                    ]),
                            },
                            {
                                text: t("separateAudio"),
                                id: "separate-audio",
                                nodeType: "separateAudioTrackNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "separateAudioTrackNode",
                                            data,
                                        },
                                    ]),
                            },
                            {
                                text: t("separateSpeaker"),
                                id: "separate-speaker",
                                nodeType: "separateSpeakerNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "separateSpeakerNode", data },
                                    ]),
                            },
                            {
                                text: t("denoise"),
                                id: "denoise-audio",
                                nodeType: "denoiseAudioSubtitleNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "denoiseAudioSubtitleNode",
                                            data,
                                        },
                                    ]),
                            },
                            {
                                text: t("convertVoice"),
                                id: "convert-voice",
                                nodeType: "convertVoiceNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "convertVoiceNode", data },
                                    ]),
                            },
                            ...audioGroupButtons,
                        ]}
                    />
                );
            }

            case "videoNode": {
                const groupButtons: ButtonConfig[] =
                    (data.fileKeys?.length ?? 0) > 1
                        ? [
                              {
                                  text: t("split"),
                                  id: "split",
                                  onClick: () =>
                                      expands(
                                          id,
                                          (data.fileKeys ?? []).map(
                                              (fileKey) => ({
                                                  type: "videoNode",
                                                  data: { fileKeys: [fileKey] },
                                              }),
                                          ),
                                      ),
                              },
                              {
                                  text: t("filter"),
                                  id: "video-filter",
                                  onClick: () =>
                                      expands(id, [
                                          { type: "dropVideoNode", data },
                                      ]),
                              },
                              {
                                  text: t("arrange"),
                                  id: "arrange-node",
                                  onClick: () =>
                                      expands(id, [
                                          { type: "arrangeNode", data },
                                      ]),
                              },
                              {
                                  text: t("concat"),
                                  id: "concat-video",
                                  onClick: () =>
                                      expands(id, [
                                          { type: "concatVideoNode", data },
                                      ]),
                              },
                          ]
                        : [];

                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("describeReverse"),
                                id: "desc-video",
                                nodeType: "videoGenTextNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "videoGenTextNode", data },
                                    ]),
                            },
                            {
                                text: t("speechRecognize"),
                                id: "speech-recognize",
                                nodeType: "videoGenTextSpeechRecognizeNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "videoGenTextSpeechRecognizeNode",
                                            data,
                                        },
                                    ]),
                            },
                            {
                                text: t("upscale"),
                                id: "upscale-video",
                                nodeType: "videoUpscaleNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "videoUpscaleNode", data },
                                    ]),
                            },
                            {
                                text: t("editVideo"),
                                id: "video-edit",
                                nodeType: "videoEditNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "videoEditNode", data },
                                    ]),
                            },
                            {
                                text: t("extractAudioTrack"),
                                id: "extract-audio-track",
                                nodeType: "extractAudioNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "extractAudioNode", data },
                                    ]),
                            },
                            {
                                text: t("removeVideoAudio"),
                                id: "remove-video-audio",
                                nodeType: "removeVideoAudioNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "removeVideoAudioNode",
                                            data,
                                        },
                                    ]),
                            },
                            {
                                text: t("slice"),
                                id: "split-video",
                                nodeType: "splitVideoNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "splitVideoNode", data },
                                    ]),
                            },
                            {
                                text: t("firstFrame"),
                                id: "first-frame",
                                nodeType: "getFirstFrameNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "getFirstFrameNode", data },
                                    ]),
                            },
                            {
                                text: t("lastFrame"),
                                id: "last-frame",
                                nodeType: "getLastFrameNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "getLastFrameNode", data },
                                    ]),
                            },
                            ...groupButtons,
                        ]}
                    />
                );
            }

            case "imageNode": {
                const imageGroupButtons: ButtonConfig[] =
                    (data.fileKeys?.length ?? 0) > 1
                        ? [
                              {
                                  text: t("split"),
                                  id: "split",
                                  onClick: () =>
                                      expands(
                                          id,
                                          (data.fileKeys ?? []).map(
                                              (fileKey) => ({
                                                  type: "imageNode",
                                                  data: { fileKeys: [fileKey] },
                                              }),
                                          ),
                                      ),
                              },
                          ]
                        : [];

                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("describeReverse"),
                                id: "desc-image",
                                nodeType: "imageGenTextNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "imageGenTextNode", data },
                                    ]),
                            },
                            {
                                text: t("generateVideo"),
                                id: "generate-video",
                                nodeType: "imageGenVideoNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "imageGenVideoNode", data },
                                    ]),
                            },
                            {
                                text: t("editImage"),
                                id: "image-edit",
                                nodeType: "imageGenImageNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "imageGenImageNode", data },
                                    ]),
                            },
                            {
                                text: t("upscale"),
                                id: "image-upscale",
                                nodeType: "imageGenImageUpscaleNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "imageGenImageUpscaleNode",
                                            data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generate3D"),
                                id: "generate-3d",
                                nodeType: "imageGenModelNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "imageGenModelNode", data },
                                    ]),
                            },
                            ...imageGroupButtons,
                        ]}
                    />
                );
            }

            case "fileNode":
                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("parseDocument"),
                                id: "parse-doc",
                                onClick: () =>
                                    expands(id, [
                                        { type: "fileGenTextNode", data },
                                    ]),
                            },
                        ]}
                    />
                );

            case "modelNode":
                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("describeReverse"),
                                id: "desc-model",
                                onClick: () =>
                                    expands(id, [
                                        { type: "imageGenTextNode", data },
                                    ]),
                            },
                            {
                                text: t("generateVideo"),
                                id: "generate-video",
                                onClick: () =>
                                    expands(id, [
                                        { type: "imageGenVideoNode", data },
                                    ]),
                            },
                        ]}
                    />
                );

            default:
                return null;
        }
    }, [selectedNodes, expands, t]);

    return { comboActions, singleActions };
}
