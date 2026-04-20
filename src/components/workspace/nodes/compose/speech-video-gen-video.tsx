import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { memo, useMemo } from "react";
import { Video } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useR2AsyncLoader } from "@/hooks/use-r2-async-loader";
import { getR2Url } from "@/lib/r2-utils";
import { useTranslations } from "next-intl";
import useFlow from "@/hooks/use-flow";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";

const DEFAULT_FEATURE = "speech_video_gen_video";

// 媒体缩略图组件
const MediaThumbnail = memo(
    ({
        fileKey,
        label,
        type,
        loadingText,
    }: {
        fileKey?: string;
        label: string;
        type: "audio" | "video";
        loadingText: string;
    }) => {
        const { url } = useR2AsyncLoader(fileKey, { priority: "high" });

        return (
            <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100 transition-colors">
                    {type === "video" ? (
                        url ? (
                            <video
                                src={url}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full w-full">
                                <div className="text-xs text-gray-400">
                                    {loadingText}
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center justify-center h-full w-full bg-blue-50">
                            <div className="text-xs text-blue-600 font-semibold">
                                🎵
                            </div>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors" />
                </div>
                <div
                    className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                        type === "video"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-blue-100 text-blue-700"
                    }`}
                >
                    {label}
                </div>
            </div>
        );
    },
);

MediaThumbnail.displayName = "MediaThumbnail";

// 工作流执行配置
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "视频对口型",
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

const SpeechVideoGenVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const { ids } = data as { ids: string[] };
    const fromNodes = useNodesData(ids);

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        [DEFAULT_FEATURE],
        DEFAULT_FEATURE,
    );

    // 获取视频和音频数据
    const video = fromNodes.find((node) => node.type === "videoNode");
    const audio = fromNodes.find((node) => node.type === "audioNode");

    const videoFileKey = (video?.data as any)?.fileKeys?.[0];
    const audioFileKey = (audio?.data as any)?.fileKeys?.[0];

    // 补充 outputType 和 outputField 用于 BaseNode 自动处理任务完成
    const dataWithOutput = useMemo(
        () => ({
            ...data,
            outputType: "videoNode",
            outputField: "fileKeys",
        }),
        [data],
    );

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={dataWithOutput}
            workflowConfig={useMemo(
                () => ({
                    ...workflowConfig,
                    feature: featureName,
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
                                      video: getR2Url(finalVideo),
                                      audio: getR2Url(finalAudio),
                                  },
                              ]
                            : [];
                    },
                }),
                [videoFileKey, audioFileKey, featureName, t],
            )}
        >
            <div className="p-4 space-y-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(value) =>
                        updates(id, { ...data, feature: value })
                    }
                    options={singleModelSelectOptions(DEFAULT_FEATURE, (k) =>
                        t(k as Parameters<typeof t>[0]),
                    )}
                />
                {/* 媒体展示区 */}
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

            <Handle
                type="target"
                position={Position.Left}
                id="a"
                isConnectable={true}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="b"
                isConnectable={true}
            />
        </BaseNode>
    );
};

export default memo(SpeechVideoGenVideoNode);
