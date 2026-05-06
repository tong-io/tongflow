import { useNodesData } from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useNodeState } from "@/hooks/use-node-data";
import { getFileUrl } from "@/lib/file-url";
import { configParam, upstreamParam } from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

// Workflow execution config
const workflowConfig = {
    feature: "audio-image-gen-video",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        image: {
            sources: [upstreamParam("imageNode", "fileKeys[0]")],
            required: true,
        },
        audio: {
            sources: [upstreamParam("audioNode", "fileKeys[0]")],
            required: true,
        },
        text: {
            sources: [configParam("videoPrompt")],
        },
    },
};

const SpeechImageGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"audio-image-gen-video", "speechImageGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const ids = data.ids ?? [];
    const fromNodes = useNodesData(ids);

    // Get image and audio data
    const image = fromNodes.find((node) => node.type === "imageNode");
    const audio = fromNodes.find((node) => node.type === "audioNode");

    const imageFileKey = (image?.data as any)?.fileKeys?.[0];
    const audioFileKey = (audio?.data as any)?.fileKeys?.[0];

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
                    title: t("titles.speechImageGenVideo"),
                    icon: <Video className="h-5 w-5" />,
                    executeLabel: t("actions.generateVideo"),
                    executeDisabled: !imageFileKey || !audioFileKey,
                    getPrompts: () =>
                        imageFileKey && audioFileKey
                            ? [
                                  {
                                      image: getFileUrl(imageFileKey),
                                      audio: getFileUrl(audioFileKey),
                                      text: videoPrompt,
                                  },
                              ]
                            : [],
                }),
                [
                    imageFileKey,
                    audioFileKey,
                    videoPrompt,
                    t,
                ],
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
                            {audioFileKey && (
                                <MediaThumbnail
                                    fileKey={audioFileKey}
                                    label={t("compose.audio")}
                                    type="audio"
                                    loadingText={t("compose.loading")}
                                />
                            )}
                        </div>
                        {(!imageFileKey || !audioFileKey) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectImageAudio")}
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

export default memo(SpeechImageGenVideoNode);
