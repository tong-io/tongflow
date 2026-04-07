import { Handle, Position, useNodesData, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import { Video, Sparkles } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useNodeState } from "@/hooks/use-node-data";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NodeTextarea } from "../base/node-textarea";
import { useR2AsyncLoader } from "@/hooks/use-r2-async-loader";
import { getR2Url } from "@/lib/r2-utils";
import { useTranslations } from "next-intl";

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
        type: "image" | "audio";
        loadingText: string;
    }) => {
        const { url } = useR2AsyncLoader(fileKey, { priority: "high" });

        return (
            <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100 transition-colors">
                    {type === "image" ? (
                        url ? (
                            <img
                                src={url}
                                alt={label}
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
                <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                    {label}
                </div>
            </div>
        );
    },
);

MediaThumbnail.displayName = "MediaThumbnail";

// 工作流执行配置
const workflowConfig = {
    feature: "audio_image_gen_video",
    label: "语音图片生成视频",
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

const SpeechImageGenVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { ids, feature } = data as { ids: string[]; feature: string };
    const fromNodes = useNodesData(ids);

    // 获取图片和音频数据
    const image = fromNodes.find((node) => node.type === "imageNode");
    const audio = fromNodes.find((node) => node.type === "audioNode");

    const imageFileKey = (image?.data as any)?.fileKeys?.[0];
    const audioFileKey = (audio?.data as any)?.fileKeys?.[0];

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            videoPrompt: "",
        },
        data,
    );
    const { videoPrompt } = state;

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
                    title: t("titles.speechImageGenVideo"),
                    icon: <Video className="h-5 w-5" />,
                    executeLabel: t("actions.generateVideo"),
                    executeDisabled: !imageFileKey || !audioFileKey,
                    getPrompts: () =>
                        imageFileKey && audioFileKey
                            ? [
                                  {
                                      image: getR2Url(imageFileKey),
                                      audio: getR2Url(audioFileKey),
                                      text: videoPrompt,
                                  },
                              ]
                            : [],
                }),
                [imageFileKey, audioFileKey, videoPrompt, t],
            )}
        >
            <div className="p-4 space-y-4">
                {/* 媒体展示区 */}
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

                {/* 提示词输入 */}
                <NodeTextarea
                    label={t("compose.generatePromptLabel")}
                    icon={Sparkles}
                    placeholder={t("compose.generatePromptPlaceholder")}
                    value={videoPrompt}
                    onChange={(value) => setState({ videoPrompt: value })}
                    rows={4}
                />
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

export default memo(SpeechImageGenVideoNode);
