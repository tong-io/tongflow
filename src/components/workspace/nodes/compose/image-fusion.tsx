import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { memo, useRef, useMemo, useCallback } from "react";
import {
    Combine,
    Sparkles,
    RectangleHorizontal,
    Maximize2,
} from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useNodeState } from "@/hooks/use-node-data";
import useFlow from "@/hooks/use-flow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NodeTextarea } from "../base/node-textarea";
import { useR2AsyncLoader } from "@/hooks/use-r2-async-loader";
import { getR2Url } from "@/lib/r2-utils";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const aspectRatios = [
    { value: "9:16", key: "portrait", width: 720, height: 1280 }, // HD 竖屏
    { value: "16:9", key: "landscape", width: 1280, height: 720 }, // HD
    { value: "1:1", key: "square", width: 1024, height: 1024 }, // 高清正方形
    { value: "4:3", key: "standard", width: 1024, height: 768 }, // 中等标准屏
    { value: "3:4", key: "verticalStandard", width: 768, height: 1024 }, // 中等竖屏
];

const resolutions = [
    { value: "512", key: "res512", label: "512" },
    { value: "1K", key: "res1K", label: "1K" },
    { value: "2K", key: "res2K", label: "2K" },
    { value: "4K", key: "res4K", label: "4K" },
];

// ... [ImageThumbnail component]
const ImageThumbnail = memo(
    ({
        fileKey,
        label,
        onInsert,
    }: {
        fileKey?: string;
        label: string;
        onInsert: () => void;
    }) => {
        const { url } = useR2AsyncLoader(fileKey, { priority: "high" });
        const t = useTranslations("Workspace.nodes.imageFusion");

        return (
            <div
                className="flex flex-col items-center gap-1.5 cursor-pointer group"
                onClick={onInsert}
            >
                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 group-hover:border-blue-500 overflow-hidden bg-gray-100 transition-colors">
                    {url ? (
                        <img
                            src={url}
                            alt={label}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full w-full">
                            <div className="text-xs text-gray-400">
                                {t("loading")}
                            </div>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </div>
                <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded group-hover:bg-blue-200 transition-colors">
                    {label}
                </div>
            </div>
        );
    },
);

ImageThumbnail.displayName = "ImageThumbnail";

// 工作流执行配置
const workflowConfig = {
    feature: "image_fusion",
    label: "图片融合", // Static label, usually overridden by UI
    outputType: "imageNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        fileKeys: {
            sources: [
                upstreamParam("imageNode", "fileKeys", {
                    needsUrlTransform: true,
                    collectAll: true,
                }),
            ],
            required: true,
        },
        text: {
            // 从 userPrompt 获取用户输入的提示词（不会被 BaseNode 覆盖）
            sources: [configParam("userPrompt")],
        },
    },
};

const ImageFusionNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const {
        ids,
        performanceMode = "eco",
        selectedAspectRatio,
        selectedResolution,
    } = data as {
        ids: string[];
        performanceMode?: "eco" | "pro";
        selectedAspectRatio?: (typeof aspectRatios)[0];
        selectedResolution?: (typeof resolutions)[0];
    };
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const fromNodes = useNodesData(ids);

    // 根据性能模式获取 feature 名称
    const featureName =
        performanceMode === "pro" ? "image_fusion_pro" : "image_fusion";

    // 切换性能模式
    const handleTogglePerformanceMode = useCallback(
        (mode: "eco" | "pro") => {
            updates(id, {
                ...data,
                performanceMode: mode,
                feature: mode === "pro" ? "image_fusion_pro" : "image_fusion",
            });
        },
        [id, data, updates],
    );

    // 选择宽高比
    const handleSelectRatio = useCallback(
        (ratio: (typeof aspectRatios)[0]) => {
            updates(id, {
                ...data,
                selectedAspectRatio: ratio,
            });
        },
        [id, data, updates],
    );

    // 选择分辨率
    const handleSelectResolution = useCallback(
        (res: (typeof resolutions)[0]) => {
            updates(id, {
                ...data,
                selectedResolution: res,
            });
        },
        [id, data, updates],
    );

    // 当前选中的宽高比
    const currentRatio = selectedAspectRatio ?? aspectRatios[2]; // 默认 1:1
    // 当前选中的分辨率
    const currentResolution = selectedResolution ?? resolutions[1]; // 默认 1080p (1K)

    // 获取所有图片节点的 fileKeys
    const allImages = fromNodes
        .filter((node) => node.type === "imageNode")
        .map((node) => node.data?.fileKeys as string[])
        .filter((keys) => keys && keys.length > 0);

    // 从组合节点获取 textNode 的文本
    const textNode = fromNodes.find((node) => node.type === "textNode");
    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) {
            return (textNode.data as any)?.texts || [];
        }
        return [];
    }, [textNode]);

    // 判断是否有上游文本输入
    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;

    // 使用新的Hook来管理状态持久化
    // 使用 userPrompt 字段，避免与 BaseNode 保存的 prompt 对象冲突
    const [state, setState] = useNodeState(
        {
            userPrompt: "",
        },
        data,
    );
    // 确保 userPrompt 是字符串
    const userPrompt =
        typeof state.userPrompt === "string" ? state.userPrompt : "";

    // 获取实际使用的提示词
    const effectivePrompt = hasUpstreamTexts ? upstreamTexts[0] : userPrompt;

    // Textarea ref for cursor position
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // 插入图片引用到光标位置
    const insertImageRef = useCallback(
        (imageRef: string) => {
            if (!textareaRef.current) return;

            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentText = userPrompt;

            const newText =
                currentText.substring(0, start) +
                imageRef +
                currentText.substring(end);
            setState({ userPrompt: newText });

            // 恢复光标位置
            setTimeout(() => {
                textarea.focus();
                const newCursorPos = start + imageRef.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        },
        [userPrompt, setState],
    );

    // 补充 outputType 和 outputField 用于 BaseNode 自动处理任务完成
    const dataWithOutput = useMemo(
        () => ({
            ...data,
            outputType: "imageNode",
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
                feature: featureName,
                title: t("titles.imageFusion"),
                icon: <Combine className="h-5 w-5" />,
                executeLabel: t("actions.startFusion"),
                executeDisabled: !allImages || allImages.length < 2,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamImages = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[];
                    // Use upstream data if available (flat array of keys), else flatten allImages
                    const imageKeys = upstreamImages?.length
                        ? upstreamImages
                        : allImages.flat();
                    if (!imageKeys || imageKeys.length < 2) return [];
                    const fileKeys = imageKeys.map((key: string) =>
                        getR2Url(key),
                    );

                    // 优先从上游节点获取最新的文本数据
                    const ctxUpstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const text =
                        ctxUpstreamTexts && ctxUpstreamTexts.length > 0
                            ? ctxUpstreamTexts[0]
                            : effectivePrompt;

                    return [
                        {
                            fileKeys: fileKeys,
                            text,
                            width: currentRatio.width,
                            height: currentRatio.height,
                            aspectRatio: currentRatio.value,
                            resolution: currentResolution.value,
                        },
                    ];
                },
            }}
        >
            <div className="p-4 space-y-4">
                {/* 性能模式选择 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("common.performanceMode")}
                        </Label>
                        <div className="flex gap-2">
                            <Button
                                variant={
                                    performanceMode === "eco"
                                        ? "default"
                                        : "outline"
                                }
                                size="sm"
                                onClick={() =>
                                    handleTogglePerformanceMode("eco")
                                }
                                className="flex-1"
                            >
                                {t("common.ecoMode")}
                            </Button>
                            <Button
                                variant={
                                    performanceMode === "pro"
                                        ? "default"
                                        : "outline"
                                }
                                size="sm"
                                onClick={() =>
                                    handleTogglePerformanceMode("pro")
                                }
                                className="flex-1"
                            >
                                {t("common.proMode")}
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* 图片宽高比选择 */}
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
                                        currentRatio.value === ratio.value
                                            ? "default"
                                            : "outline"
                                    }
                                    size="sm"
                                    onClick={() => handleSelectRatio(ratio)}
                                    className={cn(
                                        "h-auto py-2 px-1 flex flex-row items-center gap-1 text-xs transition-all relative",
                                        currentRatio.value === ratio.value
                                            ? "bg-primary text-primary-foreground shadow-md"
                                            : "hover:bg-accent hover:text-accent-foreground",
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "border rounded transition-colors flex-shrink-0",
                                            currentRatio.value === ratio.value
                                                ? "border-primary-foreground bg-primary-foreground/20"
                                                : "border-muted-foreground/30 bg-muted/30",
                                        )}
                                        style={{
                                            width:
                                                ratio.value === "1:1"
                                                    ? "12px"
                                                    : ratio.value === "4:3"
                                                      ? "14px"
                                                      : ratio.value === "16:9"
                                                        ? "16px"
                                                        : ratio.value === "3:4"
                                                          ? "10px"
                                                          : "8px",
                                            height:
                                                ratio.value === "1:1"
                                                    ? "12px"
                                                    : ratio.value === "4:3"
                                                      ? "10px"
                                                      : ratio.value === "16:9"
                                                        ? "9px"
                                                        : ratio.value === "3:4"
                                                          ? "13px"
                                                          : "14px",
                                        }}
                                    />
                                    <div className="flex flex-col items-start min-w-0">
                                        <span className="text-xs font-medium leading-tight truncate">
                                            {t(`options.${ratio.key}`)}
                                        </span>
                                        <span className="text-xs opacity-70 leading-tight">
                                            {ratio.value}
                                        </span>
                                    </div>
                                </Button>
                            ))}
                        </div>
                        <div className="text-xs text-muted-foreground text-center">
                            {t("common.currentSize")} {currentRatio.width} ×{" "}
                            {currentRatio.height}
                        </div>
                    </div>
                </Card>

                {/* 分辨率选择 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Maximize2 className="h-4 w-4" />
                            {t("common.resolution")}
                        </Label>
                        <div className="grid grid-cols-4 gap-2">
                            {resolutions.map((res) => (
                                <Button
                                    key={res.value}
                                    variant={
                                        currentResolution.value === res.value
                                            ? "default"
                                            : "outline"
                                    }
                                    size="sm"
                                    onClick={() => handleSelectResolution(res)}
                                    className={cn(
                                        "h-auto py-2 px-2 text-xs transition-all",
                                        currentResolution.value === res.value
                                            ? "bg-primary text-primary-foreground shadow-md"
                                            : "hover:bg-accent hover:text-accent-foreground",
                                    )}
                                >
                                    {res.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                </Card>

                {/* 图片缩略图选择区 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("imageFusion.imageReference")}
                            <span className="ml-2 text-xs font-normal">
                                ({allImages.length}/14)
                            </span>
                        </Label>
                        <div className="flex gap-3 flex-wrap">
                            {allImages.slice(0, 14).map((images, index) => (
                                <ImageThumbnail
                                    key={index}
                                    fileKey={images[0]}
                                    label={`${t("imageFusion.imageLabel")}${index + 1}`}
                                    onInsert={() =>
                                        insertImageRef(
                                            `${t("imageFusion.imageLabel")}${index + 1}`,
                                        )
                                    }
                                />
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {allImages.length > 14
                                ? t("imageFusion.maxImagesWarning")
                                : t("imageFusion.imageReferenceHint")}
                        </p>
                    </div>
                </Card>

                {/* 融合提示词输入 - 如果有上游文本，显示预览 */}
                {hasUpstreamTexts ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Sparkles className="h-4 w-4" />
                                {t("imageFusion.fusionPrompt")}
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
                    <Card className="p-3">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Sparkles className="h-4 w-4" />
                                {t("imageFusion.fusionPrompt")}
                            </Label>
                            <NodeTextarea
                                ref={textareaRef}
                                showCard={false}
                                placeholder={t(
                                    "imageFusion.fusionPromptPlaceholder",
                                )}
                                value={userPrompt}
                                onChange={(value) =>
                                    setState({ userPrompt: value })
                                }
                                rows={4}
                            />
                        </div>
                    </Card>
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

export default memo(ImageFusionNode);
