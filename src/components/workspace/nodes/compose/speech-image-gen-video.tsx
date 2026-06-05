import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Image as ImageIcon, Music, Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    type AspectRatio,
    VIDEO_ASPECT_RATIOS,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import { collectHandleValues, resolveSpec } from "@/lib/abi/resolve";
import type { SourceSpec } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

const AUDIO_IMAGE_GEN_VIDEO_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.speechImageGenVideoNode as SourceSpec<"audio-image-gen-video">;

const SpeechImageGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "audio-image-gen-video",
    "speechImageGenVideoNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm(
        "audio-image-gen-video",
        AUDIO_IMAGE_GEN_VIDEO_SOURCE_SPEC,
    );

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () =>
            resolveSpec(
                "audio-image-gen-video",
                AUDIO_IMAGE_GEN_VIDEO_SOURCE_SPEC,
            ),
        [],
    );

    const { hasImage, hasAudio, imageFileKey, audioFileKey } = useMemo(() => {
        if (!nodeId) {
            return {
                hasImage: false,
                hasAudio: false,
                imageFileKey: undefined as string | undefined,
                audioFileKey: undefined as string | undefined,
            };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        const image =
            typeof values.image === "string" ? values.image : undefined;
        const audio =
            typeof values.audio === "string" ? values.audio : undefined;
        return {
            hasImage: Boolean(image),
            hasAudio: Boolean(audio),
            imageFileKey: image,
            audioFileKey: audio,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    const width = (form.state.width as number | undefined) ?? 1024;
    const height = (form.state.height as number | undefined) ?? 576;

    useEffect(() => {
        if (form.state.width === undefined && form.state.height === undefined) {
            form.patch({ width: 1024, height: 576 });
        }
    }, [form.state.width, form.state.height, form.patch]);

    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[0];

    return (
        <AbiNodeShell
            feature="audio-image-gen-video"
            sourceSpec={AUDIO_IMAGE_GEN_VIDEO_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.speechImageGenVideo")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={tActions("generateVideo")}
            executeDisabled={!hasImage || !hasAudio}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <div className="flex gap-4">
                            {imageFileKey ? (
                                <MediaThumbnail
                                    fileKey={imageFileKey}
                                    label={t("compose.image")}
                                    type="image"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                        <div className="flex items-center justify-center h-full w-full bg-blue-50">
                                            <ImageIcon className="w-6 h-6 text-blue-600" />
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                        {t("compose.image")}
                                    </div>
                                </div>
                            )}
                            {audioFileKey ? (
                                <MediaThumbnail
                                    fileKey={audioFileKey}
                                    label={t("compose.audio")}
                                    type="audio"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                        <div className="flex items-center justify-center h-full w-full bg-orange-50">
                                            <Music className="w-6 h-6 text-orange-600" />
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                                        {t("compose.audio")}
                                    </div>
                                </div>
                            )}
                        </div>
                        {(!hasImage || !hasAudio) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectImageAudio")}
                            </p>
                        )}
                    </div>
                </Card>

                <NodeTextarea
                    label={t("compose.generatePromptLabel")}
                    icon={Sparkles}
                    placeholder={t("compose.generatePromptPlaceholder")}
                    {...form.bind("text")}
                    rows={4}
                />

                <AspectRatioPicker
                    ratios={VIDEO_ASPECT_RATIOS}
                    value={currentRatio}
                    onChange={(ratio) =>
                        form.patch({ width: ratio.width, height: ratio.height })
                    }
                    showSize
                />
            </div>
        </AbiNodeShell>
    );
};

SpeechImageGenVideoNode.displayName = "SpeechImageGenVideoNode";

export default memo(SpeechImageGenVideoNode);
