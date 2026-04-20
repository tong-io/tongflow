import {
    Handle,
    Position,
    type NodeProps,
    useNodeId,
    useNodesData,
    useStore,
} from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import { memo, useMemo } from "react";
import { Atom, RectangleHorizontal, Clock } from "lucide-react";

import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { useNodeState } from "@/hooks/use-node-data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NodeTextarea } from "../base/node-textarea";
import { cn } from "@/lib/utils";
import { getR2Url } from "@/lib/r2-utils";
import {
    upstreamParam,
    configParam,
    staticParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";

const aspectRatios = [
    { value: "9:16", label: "portrait", width: 576, height: 1024 }, // 高 1024 的竖屏（保持9:16）
    { value: "16:9", label: "landscape", width: 1024, height: 576 }, // 高 576 的宽屏（保持16:9）
    { value: "1:1", label: "square", width: 1024, height: 1024 }, // 高清正方形
    { value: "4:3", label: "standard", width: 1024, height: 768 }, // 中等标准屏
    { value: "3:4", label: "verticalStandard", width: 768, height: 1024 }, // 中等竖屏
];

const durations = [
    { value: "5", label: "5秒" },
    { value: "10", label: "10秒" },
    { value: "15", label: "15秒" },
    { value: "30", label: "30秒" },
    { value: "60", label: "1分钟" },
];

// 工作流执行配置（会被 BaseNode 自动注册）
const workflowConfig = {
    feature: "image_gen_video",
    label: "Image to Video",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "image",
    paramMappings: {
        image: {
            sources: [
                upstreamParam("imageNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
        text: {
            sources: [
                upstreamParam("textNode", "texts[0]"),
                configParam("query"),
                staticParam(""),
            ],
        },
        width: {
            sources: [
                configParam("selectedAspectRatio.width"),
                staticParam(1024),
            ],
        },
        height: {
            sources: [
                configParam("selectedAspectRatio.height"),
                staticParam(576),
            ],
        },
        duration: {
            sources: [configParam("duration"), staticParam("5")],
        },
    },
};

const TextGenVideoNode = ({ selected, data }: NodeProps) => {
    const { ids = [], fileKeys: localFileKeys = [] } = data as {
        ids?: string[];
        fileKeys?: string[];
        feature?: string;
    };
    const nodeId = useNodeId();
    const updates = useFlow((s) => s.updates);

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        ["image_gen_video"],
        "image_gen_video",
    );

    // 获取边和节点信息，用于检测上游连接
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    // 如果有 ids，从关联节点获取数据（组合模式）
    const fromNodes = useNodesData(ids);
    const imageNode = fromNodes.find((node) => node.type === "imageNode");
    const textNode = fromNodes.find((node) => node.type === "textNode");

    // 从组合节点或直接从 data 获取 fileKeys 和 texts
    const fileKeys: string[] = useMemo(() => {
        if (imageNode) {
            return (imageNode.data as any)?.fileKeys || [];
        }
        return localFileKeys;
    }, [imageNode, localFileKeys]);

    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) {
            return (textNode.data as any)?.texts || [];
        }
        return (data as any)?.texts || [];
    }, [textNode, data]);

    // 判断是否有组合模式的上游文本输入
    const hasCompositeText = upstreamTexts && upstreamTexts.length > 0;

    // 检测是否有上游 imageNode 和 textNode 连接（包括组合模式）
    const { hasUpstreamImage, hasUpstreamText, upstreamImageHasData } =
        useMemo(() => {
            // 组合模式已有数据
            if (ids.length > 0) {
                return {
                    hasUpstreamImage: !!imageNode,
                    hasUpstreamText: hasCompositeText,
                    upstreamImageHasData: fileKeys.length > 0,
                };
            }

            if (!nodeId)
                return {
                    hasUpstreamImage: false,
                    hasUpstreamText: false,
                    upstreamImageHasData: false,
                };

            const incomingEdges = edges.filter(
                (edge) => edge.target === nodeId,
            );
            let hasImage = false;
            let hasText = false;
            let imageHasData = false;

            for (const edge of incomingEdges) {
                const sourceNode = nodeLookup.get(edge.source);
                if (sourceNode?.type === "imageNode") {
                    hasImage = true;
                    const nodeData = sourceNode.data as { fileKeys?: string[] };
                    if (nodeData?.fileKeys && nodeData.fileKeys.length > 0) {
                        imageHasData = true;
                    }
                }
                if (sourceNode?.type === "textNode") {
                    hasText = true;
                }
            }

            return {
                hasUpstreamImage: hasImage,
                hasUpstreamText: hasText,
                upstreamImageHasData: imageHasData,
            };
        }, [
            nodeId,
            nodeLookup,
            edges,
            ids,
            imageNode,
            hasCompositeText,
            fileKeys,
        ]);

    // 使用 Hook 管理状态持久化
    const [state, setState] = useNodeState(
        {
            query: "",
            selectedAspectRatio: aspectRatios[0],
            duration: "5",
        },
        data,
    );
    const { query, selectedAspectRatio, duration } = state;
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");

    // 判断按钮是否应该禁用：本地有图片数据，或者上游有图片数据
    const hasImageData = fileKeys?.length > 0 || upstreamImageHasData;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: featureName,
                title: t("titles.imageGenVideo"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: tActions("generateVideo"),
                executeDisabled: !hasImageData,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    // 获取上游文本节点的文本，如果有的话优先使用
                    const ctxUpstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    // 优先级：ctx上游 > 组合模式上游 > 本地输入
                    const text =
                        ctxUpstreamTexts && ctxUpstreamTexts.length > 0
                            ? ctxUpstreamTexts[0]
                            : hasCompositeText
                              ? upstreamTexts[0]
                              : query;
                    return keys.map((fileKey) => ({
                        image: getR2Url(fileKey),
                        text: text,
                        width: selectedAspectRatio.width,
                        height: selectedAspectRatio.height,
                        duration: duration,
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(value) =>
                        updates(nodeId!, {
                            ...data,
                            feature: value,
                        })
                    }
                    options={singleModelSelectOptions("image_gen_video", (k) =>
                        t(k as Parameters<typeof t>[0]),
                    )}
                />

                {/* 视频描述输入 - 如果有组合模式的上游文本，显示预览 */}
                {hasCompositeText ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("common.videoDesc")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {upstreamTexts.map((text, index) => (
                                    <div
                                        key={index}
                                        className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3"
                                    >
                                        {text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                ) : (
                    <NodeTextarea
                        rows={4}
                        placeholder={
                            hasUpstreamText
                                ? t("common.fromUpstreamText")
                                : t("common.descOptional")
                        }
                        value={query}
                        onChange={(value) => setState({ query: value })}
                        disabled={hasUpstreamText}
                    />
                )}

                {/* 视频宽高比选择 */}
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
                                        selectedAspectRatio.value ===
                                        ratio.value
                                            ? "default"
                                            : "outline"
                                    }
                                    size="sm"
                                    onClick={() =>
                                        setState({ selectedAspectRatio: ratio })
                                    }
                                    className={cn(
                                        "h-auto py-2 px-1 flex flex-row items-center gap-1 text-xs transition-all",
                                        selectedAspectRatio.value ===
                                            ratio.value
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

                {/* 视频时长选择 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {t("common.duration")}
                        </Label>
                        <div className="grid grid-cols-5 gap-2">
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

TextGenVideoNode.displayName = "TextGenVideoNode";

export default memo(TextGenVideoNode);
