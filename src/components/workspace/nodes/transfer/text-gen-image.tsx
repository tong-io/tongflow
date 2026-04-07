import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { RectangleHorizontal, Atom } from "lucide-react";

import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
    upstreamParam,
    configParam,
    staticParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

/**
 * TextGenImageNode 数据结构
 * feature 和 prompt 直接存储在 data 中，可用于后端执行
 */
interface TextGenImageNodeData extends Record<string, unknown> {
    /** 功能标识 */
    feature: string;
    /** 执行参数 */
    prompt: {
        /** 宽度 */
        width: number;
        /** 高度 */
        height: number;
    };
    /** 从上游接收的文本（执行时使用） */
    texts?: string[];
    /** UI 显示用的宽高比选项 */
    selectedAspectRatio?: {
        value: string;
        label: string;
        width: number;
        height: number;
    };
    /** 性能模式：'eco' 为性价比模式，'pro' 为高性能模式 */
    performanceMode?: "eco" | "pro";
}

interface TextGenImageNodeProps extends NodeProps {
    data: TextGenImageNodeData;
}

const aspectRatios = [
    { value: "9:16", key: "portrait", width: 720, height: 1280 }, // HD 竖屏
    { value: "16:9", key: "landscape", width: 1280, height: 720 }, // HD
    { value: "1:1", key: "square", width: 1024, height: 1024 }, // 高清正方形
    { value: "4:3", key: "standard", width: 1024, height: 768 }, // 中等标准屏
    { value: "3:4", key: "verticalStandard", width: 768, height: 1024 }, // 中等竖屏
];

// 默认 prompt 参数
const defaultPrompt = {
    width: 1024,
    height: 1024,
};

// 工作流执行配置
const workflowConfig = {
    feature: "image_gen",
    label: "文本生成图片",
    outputType: "imageNode",
    outputField: "fileKeys" as const,
    paramMappings: {
        // 注意：text 参数优先从上游 textNode 获取，确保使用动态生成的文本
        text: {
            sources: [upstreamParam("textNode", "texts[0]")],
            required: true,
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
                staticParam(1024),
            ],
        },
    },
};

const TextGenImageNode = ({ selected, data }: TextGenImageNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { texts = [], selectedAspectRatio, performanceMode = "eco" } = data;
    const prompt = data.prompt ?? defaultPrompt;
    const id = useNodeId()!;
    const updates = useFlow((s) => s.updates);

    // 根据性能模式获取 feature 名称
    const featureName =
        performanceMode === "pro" ? "image_gen_pro" : "image_gen";

    // 更新 prompt 参数（直接修改 data）
    const updatePrompt = useCallback(
        (newPrompt: Partial<TextGenImageNodeData["prompt"]>) => {
            updates(id, {
                ...data,
                prompt: { ...prompt, ...newPrompt },
            });
        },
        [id, data, prompt, updates],
    );

    // 选择宽高比
    const handleSelectRatio = useCallback(
        (ratio: (typeof aspectRatios)[0]) => {
            updates(id, {
                ...data,
                prompt: { ...prompt, width: ratio.width, height: ratio.height },
                selectedAspectRatio: ratio,
            });
        },
        [id, data, prompt, updates],
    );

    // 切换性能模式
    const handleTogglePerformanceMode = useCallback(
        (mode: "eco" | "pro") => {
            updates(id, {
                ...data,
                performanceMode: mode,
                feature: mode === "pro" ? "image_gen_pro" : "image_gen",
            });
        },
        [id, data, updates],
    );

    // 当前选中的宽高比（根据 prompt 中的宽高匹配）
    const currentRatio =
        selectedAspectRatio ??
        aspectRatios.find(
            (r) => r.width === prompt.width && r.height === prompt.height,
        ) ??
        aspectRatios[0];

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: featureName,
                title: t("titles.textGenImage"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.generateImage"),
                executeDisabled: !texts?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const inputTexts =
                        upstreamTexts && upstreamTexts.length > 0
                            ? upstreamTexts
                            : texts;
                    return inputTexts.map((text) => ({
                        text,
                        width: prompt.width,
                        height: prompt.height,
                    }));
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
                            {t("common.currentSize")} {prompt.width} ×{" "}
                            {prompt.height}
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

TextGenImageNode.displayName = "TextGenImageNode";

export default memo(TextGenImageNode);
