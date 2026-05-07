import { useNodesData } from "@xyflow/react";
import { Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getFileUrl } from "@/lib/file-url";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";
import { MediaThumbnail } from "../base/media-thumbnail";

// Workflow execution config
const workflowConfig = {
    feature: "speech-video-gen-video",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        video: {
            sources: [upstreamParam("videoNode", "fileKeys[0]")],
            required: true,
        },
        audio: {
            sources: [upstreamParam("audioNode", "fileKeys[0]")],
            required: true,
        },
    },
};

const SpeechVideoGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "speech-video-gen-video",
    "speechVideoGenVideoNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const ids = data.ids ?? [];
    const fromNodes = useNodesData(ids);

    // Get video and audio data
    const video = fromNodes.find((node) => node.type === "videoNode");
    const audio = fromNodes.find((node) => node.type === "audioNode");

    const videoFileKey = (video?.data as any)?.fileKeys?.[0];
    const audioFileKey = (audio?.data as any)?.fileKeys?.[0];

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={useMemo(
                () => ({
                    ...workflowConfig,
                    title: t("titles.speechVideoGenVideo"),
                    icon: <Video className="h-5 w-5" />,
                    executeLabel: t("compose.lipSync"),
                    executeDisabled: !videoFileKey || !audioFileKey,
                    getPrompts: (ctx?: GetPromptsContext) => {
                        const upstreamVideo = ctx?.getUpstreamData(
                            "videoNode",
                            "fileKeys[0]",
                        );
                        const upstreamAudio = ctx?.getUpstreamData(
                            "audioNode",
                            "fileKeys[0]",
                        );
                        const finalVideo = upstreamVideo || videoFileKey;
                        const finalAudio = upstreamAudio || audioFileKey;
                        return finalVideo && finalAudio
                            ? [
                                  {
                                      video: getFileUrl(finalVideo),
                                      audio: getFileUrl(finalAudio),
                                  },
                              ]
                            : [];
                    },
                }),
                [videoFileKey, audioFileKey, t],
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
                            {videoFileKey && (
                                <MediaThumbnail
                                    fileKey={videoFileKey}
                                    label={t("compose.video")}
                                    type="video"
                                    loadingText={t("compose.loading")}
                                />
                            )}
                            {audioFileKey && (
                                <MediaThumbnail
                                    fileKey={audioFileKey}
                                    label={t("compose.audio")}
                                    type="audio"
                                    loadingText={t("compose.loading")}
                                />
                            )}
                        </div>
                        {(!videoFileKey || !audioFileKey) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectVideoAudio")}
                            </p>
                        )}
                    </div>
                </Card>
            </div>
        </BaseNode>
    );
};

export default memo(SpeechVideoGenVideoNode);
