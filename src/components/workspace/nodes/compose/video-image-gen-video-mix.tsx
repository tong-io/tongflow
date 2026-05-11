import { useNodesData } from "@xyflow/react";
import { Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useNodeState } from "@/hooks/use-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    configParam,
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

// Workflow execution config
const workflowConfig = {
    feature: "video-image-gen-video-mix",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        image: {
            sources: [upstreamParam("imageNode", "fileKeys[0]")],
            required: true,
        },
        video: {
            sources: [upstreamParam("videoNode", "fileKeys[0]")],
            required: true,
        },
        text: {
            sources: [configParam("videoPrompt")],
        },
    },
};

const VideoImageGenVideoMixNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "video-image-gen-video-mix",
    "videoImageGenVideoMixNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const ids = data.ids ?? [];
    const fromNodes = useNodesData(ids);

    // Get image and video data
    const image = fromNodes.find((node) => node.type === "imageNode");
    const video = fromNodes.find((node) => node.type === "videoNode");

    const imageFileKey = (image?.data as any)?.fileKeys?.[0];
    const videoFileKey = (video?.data as any)?.fileKeys?.[0];

    // Use the new hook to manage state persistence
    const [state, setState] = useNodeState(
        {
            videoPrompt: "",
        },
        data,
    );
    const { videoPrompt } = state;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={useMemo(
                () => ({
                    ...workflowConfig,
                    title: t("titles.videoImageMix"),
                    icon: <Video className="h-5 w-5" />,
                    executeLabel: t("actions.generateVideo"),
                    executeDisabled: !imageFileKey || !videoFileKey,
                    getPrompts: (ctx?: GetPromptsContext) => {
                        const upstreamImage = ctx?.getUpstreamData(
                            "imageNode",
                            "fileKeys[0]",
                        );
                        const upstreamVideo = ctx?.getUpstreamData(
                            "videoNode",
                            "fileKeys[0]",
                        );
                        const finalImage = upstreamImage || imageFileKey;
                        const finalVideo = upstreamVideo || videoFileKey;
                        return finalImage && finalVideo
                            ? [
                                  {
                                      image: finalImage,
                                      video: finalVideo,
                                      text: videoPrompt,
                                  },
                              ]
                            : [];
                    },
                }),
                [imageFileKey, videoFileKey, videoPrompt, t],
            )}
        >
            <div className="p-4 space-y-4">
                {/* Media display area */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.mediaFiles")}
                        </Label>
                        <div className="flex gap-4">
                            {imageFileKey && (
                                <MediaThumbnail
                                    fileKey={imageFileKey}
                                    label={t("compose.image")}
                                    type="image"
                                    loadingText={t("compose.loading")}
                                />
                            )}
                            {videoFileKey && (
                                <MediaThumbnail
                                    fileKey={videoFileKey}
                                    label={t("compose.video")}
                                    type="video"
                                    loadingText={t("compose.loading")}
                                />
                            )}
                        </div>
                        {(!imageFileKey || !videoFileKey) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectImageVideo")}
                            </p>
                        )}
                    </div>
                </Card>

                {/* Prompt input */}
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

export default memo(VideoImageGenVideoMixNode);
