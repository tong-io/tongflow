import { Handle, Position, useNodesData, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import { Subtitles, FileText } from "lucide-react";
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

// 视频缩略图组件
const VideoThumbnail = memo(
    ({
        fileKey,
        label,
        loadingText,
    }: {
        fileKey?: string;
        label: string;
        loadingText: string;
    }) => {
        const { url } = useR2AsyncLoader(fileKey, { priority: "high" });

        return (
            <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100 transition-colors">
                    {url ? (
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
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors" />
                </div>
                <div className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                    {label}
                </div>
            </div>
        );
    },
);

VideoThumbnail.displayName = "VideoThumbnail";

// 文本预览组件
const TextPreview = memo(
    ({
        text,
        label,
        noTextLabel,
    }: {
        text?: string;
        label: string;
        noTextLabel: string;
    }) => {
        return (
            <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-32 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-50 transition-colors">
                    <div className="flex items-center justify-center h-full w-full p-2">
                        {text ? (
                            <div className="text-xs text-gray-700 line-clamp-3 text-center">
                                {text}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 text-gray-400">
                                <FileText className="h-4 w-4" />
                                <span className="text-xs">{noTextLabel}</span>
                            </div>
                        )}
                    </div>
                    <div className="absolute inset-0 bg-black/0 transition-colors" />
                </div>
                <div className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                    {label}
                </div>
            </div>
        );
    },
);

TextPreview.displayName = "TextPreview";

// 工作流执行配置
const workflowConfig = {
    feature: "text_video_gen_video_subtitle_video",
    label: "视频添加字幕",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        text: {
            sources: [
                upstreamParam("textNode", "texts[0]"),
                configParam("text"),
            ],
            required: true,
        },
        video: {
            sources: [upstreamParam("videoNode", "fileKeys[0]")],
            required: true,
        },
    },
};

const TextVideoGenVideoSubtitleVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { ids, feature } = data as { ids: string[]; feature: string };
    const fromNodes = useNodesData(ids);

    // 获取文本和视频数据
    const textNode = fromNodes.find((node) => node.type === "textNode");
    const video = fromNodes.find((node) => node.type === "videoNode");

    const textContent = (textNode?.data as any)?.texts?.[0] || "";
    const videoFileKey = (video?.data as any)?.fileKeys?.[0];

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            text: "",
        },
        data,
    );
    const { text } = state;

    const finalText = textContent || text;

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
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.subtitleVideo"),
                icon: <Subtitles className="h-5 w-5" />,
                executeLabel: t("actions.addSubtitle"),
                executeDisabled: (!textContent && !text) || !videoFileKey,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamText = ctx?.getUpstreamData(
                        "textNode",
                        "texts[0]",
                    );
                    const upstreamVideo = ctx?.getUpstreamData(
                        "videoNode",
                        "fileKeys[0]",
                    );
                    const finalTextValue = upstreamText || finalText;
                    const finalVideoValue = upstreamVideo || videoFileKey;
                    return finalTextValue && finalVideoValue
                        ? [
                              {
                                  text: finalTextValue,
                                  video: getR2Url(finalVideoValue),
                              },
                          ]
                        : [];
                },
            }}
        >
            <div className="p-4 space-y-4">
                {/* 媒体展示区 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputContent")}
                        </Label>
                        <div className="flex gap-4">
                            {textContent && (
                                <TextPreview
                                    text={textContent}
                                    label={t("compose.subtitleText")}
                                    noTextLabel={t("compose.noText")}
                                />
                            )}
                            {videoFileKey && (
                                <VideoThumbnail
                                    fileKey={videoFileKey}
                                    label={t("compose.video")}
                                    loadingText={t("compose.loading")}
                                />
                            )}
                        </div>
                        {(!textContent || !videoFileKey) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectSubtitleVideo")}
                            </p>
                        )}
                    </div>
                </Card>

                {/* 文本输入 - 当没有从上个节点获取到文本时显示 */}
                {!textContent && (
                    <NodeTextarea
                        label={t("compose.inputSubtitle")}
                        icon={Subtitles}
                        placeholder={t("compose.subtitlePlaceholder")}
                        value={text}
                        onChange={(value) => setState({ text: value })}
                        rows={4}
                    />
                )}
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

export default memo(TextVideoGenVideoSubtitleVideoNode);
