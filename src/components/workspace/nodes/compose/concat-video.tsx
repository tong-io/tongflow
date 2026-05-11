import { useNodesData } from "@xyflow/react";
import { Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { upstreamParam } from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";
import { MediaThumbnail } from "../base/media-thumbnail";

// Workflow execution config
const workflowConfig = {
    feature: "concat-videos",
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

const ConcatVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"concat-videos", "concatVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const ids = data.ids ?? [];
    const fromNodes = useNodesData(ids);

    // Get all connected video nodes
    const videoNodes = fromNodes.filter((node) => node.type === "videoNode");

    // Collect fileKeys from all videos
    const videoFileKeys = videoNodes.flatMap(
        (node) => (node.data as any)?.fileKeys || [],
    );

    // Local ordering state
    const [orderedFileKeys, setOrderedFileKeys] =
        useState<string[]>(videoFileKeys);
    const dragIndexRef = useRef<number | null>(null);

    // Reset order when upstream inputs change
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

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.concatVideo"),
                icon: <Video className="h-5 w-5" />,
                executeLabel: t("actions.concatVideo"),
                executeDisabled: orderedFileKeys.length === 0,
                getPrompts: () =>
                    orderedFileKeys.length > 0
                        ? [
                              {
                                  videos: orderedFileKeys,
                              },
                          ]
                        : [],
            }}
        >
            <div className="p-4 space-y-4">
                {/* Media display area */}
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
        </BaseNode>
    );
};

export default memo(ConcatVideoNode);
