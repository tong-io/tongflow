import { useNodeId, useNodesData } from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { memo, useMemo } from "react";
import { Video, Sparkles } from "lucide-react";
import { BaseNode } from "../base/base-node";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { DurationPicker } from "../base/duration-picker";
import {
    upstreamParam,
    configParam,
    staticParam,
} from "@/utils/node-execution-config";
import { useNodeState } from "@/hooks/use-node-data";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NodeTextarea } from "../base/node-textarea";
import { MediaThumbnail } from "../base/media-thumbnail";
import { getFileUrl } from "@/lib/file-url";
import { VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS } from "@/constants/media-options";
import { useTranslations } from "next-intl";
import useFlow from "@/hooks/use-flow";

const DEFAULT_FEATURE = "image-image-gen-video";

const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        start_image: {
            sources: [
                upstreamParam("imageNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
        end_image: {
            sources: [
                upstreamParam("imageNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
        text: {
            sources: [configParam("videoPrompt")],
        },
        width: {
            sources: [
                configParam("selectedAspectRatio.width"),
                staticParam(1280),
            ],
        },
        height: {
            sources: [
                configParam("selectedAspectRatio.height"),
                staticParam(704),
            ],
        },
        duration: {
            sources: [configParam("duration"), staticParam("10")],
        },
    },
};

const ImageImageGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-image-gen-video", "imageImageGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const ids = data.ids ?? [];
    const fromNodes = useNodesData(ids);

    const imageNodes = fromNodes.filter((node) => node.type === "imageNode");

    const firstImageFileKey = (imageNodes[0]?.data as any)?.fileKeys?.[0];
    const secondImageFileKey = (imageNodes[1]?.data as any)?.fileKeys?.[0];

    const [state, setState] = useNodeState(
        {
            videoPrompt: "",
            selectedAspectRatio: VIDEO_ASPECT_RATIOS[1],
            duration: "10",
        },
        data,
    );
    const { videoPrompt, selectedAspectRatio, duration } = state;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={useMemo(
                () => ({
                    ...workflowConfig,
                    title: t("titles.imageImageGenVideo"),
                    icon: <Video className="h-5 w-5" />,
                    executeLabel: t("actions.generateVideo"),
                    executeDisabled: !firstImageFileKey || !secondImageFileKey,
                    getPrompts: () =>
                        firstImageFileKey && secondImageFileKey
                            ? [
                                  {
                                      start_image: getFileUrl(firstImageFileKey),
                                      end_image: getFileUrl(secondImageFileKey),
                                      text: videoPrompt,
                                      width: selectedAspectRatio.width,
                                      height: selectedAspectRatio.height,
                                      duration: Number(duration),
                                  },
                              ]
                            : [],
                }),
                [
                    firstImageFileKey,
                    secondImageFileKey,
                    videoPrompt,
                    selectedAspectRatio,
                    duration,
                    t,
                ],
            )}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.mediaFiles")}
                        </Label>
                        <div className="flex gap-4">
                            {firstImageFileKey && (
                                <MediaThumbnail
                                    fileKey={firstImageFileKey}
                                    label={t("compose.firstFrame")}
                                    type="image"
                                    loadingText={t("compose.loading")}
                                />
                            )}
                            {secondImageFileKey && (
                                <MediaThumbnail
                                    fileKey={secondImageFileKey}
                                    label={t("compose.lastFrame")}
                                    type="image"
                                    loadingText={t("compose.loading")}
                                />
                            )}
                        </div>
                        {(!firstImageFileKey || !secondImageFileKey) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectTwoImages")}
                            </p>
                        )}
                    </div>
                </Card>

                <AspectRatioPicker
                    ratios={VIDEO_ASPECT_RATIOS}
                    value={selectedAspectRatio}
                    onChange={(ratio) => setState({ selectedAspectRatio: ratio })}
                    showSize
                />

                <DurationPicker
                    durations={VIDEO_DURATIONS}
                    value={duration}
                    onChange={(dur) => setState({ duration: dur })}
                />

                <NodeTextarea
                    label={t("compose.generatePromptLabel")}
                    icon={Sparkles}
                    placeholder={t("compose.generatePromptPlaceholder")}
                    value={videoPrompt}
                    onChange={(value) => setState({ videoPrompt: value })}
                    rows={4}
                />
            </div>

        </BaseNode>
    );
};

export default memo(ImageImageGenVideoNode);
