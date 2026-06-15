import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { ImageIcon, Sparkles, Type, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { VIDEO_DURATION_DEFAULT } from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import { collectHandleValues, resolveSpec } from "@/lib/abi/resolve";
import type { SourceSpec } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";
import { VideoDurationSlider } from "../base/video-duration-slider";

const VIDEO_IMAGE_GEN_VIDEO_MOVE_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.videoImageGenVideoMoveNode as SourceSpec<"video-image-gen-video-move">;

const VideoImageGenVideoMoveNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "video-image-gen-video-move",
    "videoImageGenVideoMoveNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm(
        "video-image-gen-video-move",
        VIDEO_IMAGE_GEN_VIDEO_MOVE_SOURCE_SPEC,
    );

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () =>
            resolveSpec(
                "video-image-gen-video-move",
                VIDEO_IMAGE_GEN_VIDEO_MOVE_SOURCE_SPEC,
            ),
        [],
    );

    const { hasImage, hasVideo, imageFileKey, videoFileKey, promptText } =
        useMemo(() => {
            if (!nodeId) {
                return {
                    hasImage: false,
                    hasVideo: false,
                    imageFileKey: undefined as string | undefined,
                    videoFileKey: undefined as string | undefined,
                    promptText: "",
                };
            }
            const values = collectHandleValues(
                nodeId,
                resolvedSpec,
                Array.from(nodeLookup.values()),
                edges,
            );
            const text =
                typeof values.text === "string" ? values.text.trim() : "";
            const image =
                typeof values.image === "string" ? values.image : undefined;
            const video =
                typeof values.video === "string" ? values.video : undefined;
            return {
                hasImage: Boolean(image),
                hasVideo: Boolean(video),
                imageFileKey: image,
                videoFileKey: video,
                promptText: text,
            };
        }, [nodeId, resolvedSpec, nodeLookup, edges]);

    const manualText = (form.state.text as string | undefined)?.trim() ?? "";
    const effectiveText = promptText || manualText;

    const durationSeconds =
        (form.state.duration as number | undefined) ?? VIDEO_DURATION_DEFAULT;

    useEffect(() => {
        if (form.state.duration === undefined)
            form.set("duration", VIDEO_DURATION_DEFAULT);
    }, [form.state.duration, form.set]);

    return (
        <AbiNodeShell
            feature="video-image-gen-video-move"
            sourceSpec={VIDEO_IMAGE_GEN_VIDEO_MOVE_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.videoImageMove")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={tActions("motionTrackGenerate")}
            executeDisabled={!hasImage || !hasVideo || !effectiveText}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t("motionTrack.connectHint")}
                        </p>
                        <div className="flex flex-wrap gap-4">
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
                            {videoFileKey ? (
                                <MediaThumbnail
                                    fileKey={videoFileKey}
                                    label={t("motionTrack.controlVideo")}
                                    type="video"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                        <div className="flex items-center justify-center h-full w-full bg-purple-50">
                                            <Video className="w-6 h-6 text-purple-600" />
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                        {t("motionTrack.controlVideo")}
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col items-center gap-1.5">
                                <div
                                    className={`relative w-16 h-16 rounded-md border-2 overflow-hidden ${
                                        effectiveText
                                            ? "border-green-400"
                                            : "border-gray-300"
                                    }`}
                                >
                                    <div className="flex items-center justify-center h-full w-full bg-green-50">
                                        <Type className="w-6 h-6 text-green-600" />
                                    </div>
                                </div>
                                <div className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                                    {t("compose.text")}
                                </div>
                            </div>
                        </div>
                        {(!hasImage || !hasVideo || !effectiveText) && (
                            <p className="text-xs text-red-500">
                                {t("motionTrack.missing", {
                                    items: [
                                        !hasImage && t("compose.image"),
                                        !hasVideo &&
                                            t("motionTrack.controlVideo"),
                                        !effectiveText && t("compose.text"),
                                    ]
                                        .filter(Boolean)
                                        .join("、"),
                                })}
                            </p>
                        )}
                    </div>
                </Card>

                {promptText ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("compose.generatePromptLabel")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-4">
                                {promptText}
                            </div>
                        </div>
                    </Card>
                ) : (
                    <NodeTextarea
                        label={t("compose.generatePromptLabel")}
                        icon={Sparkles}
                        placeholder={t("motionTrack.promptPlaceholder")}
                        {...form.bind("text")}
                        rows={4}
                    />
                )}

                <p className="text-xs text-muted-foreground">
                    {t("motionTrack.promptHint")}
                </p>

                <VideoDurationSlider
                    value={durationSeconds}
                    onChange={(dur) => form.set("duration", dur)}
                />
            </div>
        </AbiNodeShell>
    );
};

VideoImageGenVideoMoveNode.displayName = "VideoImageGenVideoMoveNode";

export default memo(VideoImageGenVideoMoveNode);
