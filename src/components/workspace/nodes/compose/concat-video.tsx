import { Handle, Position, useNodesData, type NodeProps } from "@xyflow/react";
import { memo, useMemo, useState, useEffect, useRef } from "react";
import { Video } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useR2AsyncLoader } from "@/hooks/use-r2-async-loader";
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
        type: "image" | "audio" | "video";
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
                    ) : type === "video" ? (
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
                        type === "image"
                            ? "bg-purple-100 text-purple-700"
                            : type === "video"
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
    feature: "concat_videos",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        fileKeys: {
            sources: [upstreamParam("videoNode", "fileKeys")],
            required: true,
        },
    },
};

const ConcatVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { ids, feature } = data as { ids: string[]; feature: string };
    const fromNodes = useNodesData(ids);

    // 获取所有连接过来的视频节点
    const videoNodes = fromNodes.filter((node) => node.type === "videoNode");

    // 收集所有视频的fileKeys
    const videoFileKeys = videoNodes.flatMap(
        (node) => (node.data as any)?.fileKeys || [],
    );

    // 本地排序状态
    const [orderedFileKeys, setOrderedFileKeys] =
        useState<string[]>(videoFileKeys);
    const dragIndexRef = useRef<number | null>(null);

    // 上游变化时重置顺序
    useEffect(() => {
        setOrderedFileKeys(videoFileKeys);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoFileKeys.join(",")]);

    const handleDragStart = (index: number) => {
        dragIndexRef.current = index;
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (dragIndexRef.current === null || dragIndexRef.current === index)
            return;
        const newKeys = [...orderedFileKeys];
        const [dragged] = newKeys.splice(dragIndexRef.current, 1);
        newKeys.splice(index, 0, dragged);
        dragIndexRef.current = index;
        setOrderedFileKeys(newKeys);
    };

    const handleDragEnd = () => {
        dragIndexRef.current = null;
    };

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
                title: t("titles.concatVideo"),
                icon: <Video className="h-5 w-5" />,
                executeLabel: t("actions.concatVideo"),
                executeDisabled: orderedFileKeys.length === 0,
                getPrompts: () =>
                    orderedFileKeys.length > 0
                        ? [{ fileKeys: orderedFileKeys }]
                        : [],
            }}
        >
            <div className="p-4 space-y-4">
                {/* 媒体展示区 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.videoFiles")} ({videoFileKeys.length})
                        </Label>
                        <div className="flex flex-wrap gap-4">
                            {orderedFileKeys.length > 0 ? (
                                orderedFileKeys.map((fileKey, index) => (
                                    <div
                                        key={`${fileKey}-${index}`}
                                        draggable
                                        onDragStart={(e) => {
                                            e.stopPropagation();
                                            handleDragStart(index);
                                        }}
                                        onDragOver={(e) =>
                                            handleDragOver(e, index)
                                        }
                                        onDragEnd={handleDragEnd}
                                        className="nodrag cursor-grab active:opacity-50 transition-opacity"
                                    >
                                        <MediaThumbnail
                                            fileKey={fileKey}
                                            label={`${t("compose.video")} ${index + 1}`}
                                            type="video"
                                            loadingText={t("compose.loading")}
                                        />
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-red-500">
                                    {t("compose.connectVideo")}
                                </p>
                            )}
                        </div>
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

export default memo(ConcatVideoNode);
