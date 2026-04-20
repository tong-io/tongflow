import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { memo, useMemo } from "react";
import { Video, Sparkles, RectangleHorizontal, Clock } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    staticParam,
} from "@/utils/node-execution-config";
import { useNodeState } from "@/hooks/use-node-data";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NodeTextarea } from "../base/node-textarea";
import { useR2AsyncLoader } from "@/hooks/use-r2-async-loader";
import { getR2Url } from "@/lib/r2-utils";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import useFlow from "@/hooks/use-flow";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";

const DEFAULT_FEATURE = "image-image-gen-video";

const aspectRatios = [
    { value: "16:9", label: "landscape", width: 1280, height: 704 },
    { value: "9:16", label: "portrait", width: 704, height: 1280 },
    { value: "1:1", label: "square", width: 1024, height: 1024 },
    { value: "4:3", label: "standard", width: 1024, height: 768 },
    { value: "3:4", label: "verticalStandard", width: 768, height: 1024 },
];

const durations = [
    { value: "5" },
    { value: "10" },
    { value: "15" },
    { value: "30" },
];

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
                <div className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                    {label}
                </div>
            </div>
        );
    },
);

MediaThumbnail.displayName = "MediaThumbnail";

// LTX Modal：ltx2-ii2v-first-last（generate_first_last）
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "图片首尾帧生成视频",
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

const ImageImageGenVideoNode = ({ selected, data }: NodeProps) => {
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

    const imageNodes = fromNodes.filter((node) => node.type === "imageNode");

    const firstImageFileKey = (imageNodes[0]?.data as any)?.fileKeys?.[0];
    const secondImageFileKey = (imageNodes[1]?.data as any)?.fileKeys?.[0];

    const [state, setState] = useNodeState(
        {
            videoPrompt: "",
            selectedAspectRatio: aspectRatios[0],
            duration: "10",
        },
        data,
    );
    const { videoPrompt, selectedAspectRatio, duration } = state;

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
                    title: t("titles.imageImageGenVideo"),
                    icon: <Video className="h-5 w-5" />,
                    executeLabel: t("actions.generateVideo"),
                    executeDisabled: !firstImageFileKey || !secondImageFileKey,
                    getPrompts: () =>
                        firstImageFileKey && secondImageFileKey
                            ? [
                                  {
                                      start_image: getR2Url(firstImageFileKey),
                                      end_image: getR2Url(secondImageFileKey),
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
                    featureName,
                    t,
                ],
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

                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <RectangleHorizontal className="h-4 w-4" />
                            {t("common.aspectRatio")}
                        </Label>
                        <div className="grid grid-cols-5 gap-2">
                            {aspectRatios.map((ratio) => (
                                <Button
                                    key={ratio.value}
                                    variant={
                                        selectedAspectRatio.value === ratio.value
                                            ? "default"
                                            : "outline"
                                    }
                                    size="sm"
                                    onClick={() =>
                                        setState({ selectedAspectRatio: ratio })
                                    }
                                    className={cn(
                                        "h-auto py-2 px-1 flex flex-row items-center gap-1 text-xs transition-all",
                                        selectedAspectRatio.value === ratio.value
                                            ? "bg-primary text-primary-foreground shadow-md"
                                            : "hover:bg-accent hover:text-accent-foreground",
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "border rounded transition-colors flex-shrink-0",
                                            selectedAspectRatio.value ===
                                                ratio.value
                                                ? "border-primary-foreground bg-primary-foreground/20"
                                                : "border-muted-foreground/30 bg-muted/30",
                                        )}
                                        style={{
                                            width:
                                                ratio.value === "16:9"
                                                    ? "16px"
                                                    : ratio.value === "9:16"
                                                      ? "8px"
                                                      : ratio.value === "1:1"
                                                        ? "12px"
                                                        : ratio.value === "4:3"
                                                          ? "14px"
                                                          : "10px",
                                            height:
                                                ratio.value === "16:9"
                                                    ? "9px"
                                                    : ratio.value === "9:16"
                                                      ? "14px"
                                                      : ratio.value === "1:1"
                                                        ? "12px"
                                                        : ratio.value === "4:3"
                                                          ? "10px"
                                                          : "13px",
                                        }}
                                    />
                                    <div className="flex flex-col items-start min-w-0">
                                        <span className="text-xs font-medium leading-tight truncate">
                                            {t(`options.${ratio.label}`)}
                                        </span>
                                        <span className="text-xs opacity-70 leading-tight">
                                            {ratio.value}
                                        </span>
                                    </div>
                                </Button>
                            ))}
                        </div>
                        <div className="text-xs text-muted-foreground text-center">
                            {t("common.currentSize")}{" "}
                            {selectedAspectRatio.width} ×{" "}
                            {selectedAspectRatio.height}
                        </div>
                    </div>
                </Card>

                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {t("common.duration")}
                        </Label>
                        <div className="grid grid-cols-4 gap-2">
                            {durations.map((dur) => (
                                <Button
                                    key={dur.value}
                                    variant={
                                        duration === dur.value
                                            ? "default"
                                            : "outline"
                                    }
                                    size="sm"
                                    onClick={() =>
                                        setState({ duration: dur.value })
                                    }
                                    className={cn(
                                        "h-auto py-2 px-1 text-xs transition-all",
                                        duration === dur.value
                                            ? "bg-primary text-primary-foreground shadow-md"
                                            : "hover:bg-accent hover:text-accent-foreground",
                                    )}
                                >
                                    {dur.value}
                                    {t("common.seconds")}
                                </Button>
                            ))}
                        </div>
                        <div className="text-xs text-muted-foreground text-center">
                            {t("common.currentDuration")} {duration}
                            {t("common.seconds")}
                        </div>
                    </div>
                </Card>

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

export default memo(ImageImageGenVideoNode);
