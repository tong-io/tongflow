"use client";

import {
    Handle,
    Position,
    type NodeProps,
    useNodeId,
    useStore,
} from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import { memo, useMemo } from "react";
import { Atom, RectangleHorizontal, Clock } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NodeTextarea } from "../base/node-textarea";
import { cn } from "@/lib/utils";
import { useNodeState } from "@/hooks/use-node-data";
import {
    upstreamParam,
    configParam,
    staticParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const aspectRatios = [
    { value: "9:16", label: "portrait", width: 576, height: 1024 },
    { value: "16:9", label: "landscape", width: 1024, height: 576 },
    { value: "1:1", label: "square", width: 1024, height: 1024 },
    { value: "4:3", label: "standard", width: 1024, height: 768 },
    { value: "3:4", label: "verticalStandard", width: 768, height: 1024 },
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
    feature: "text_gen_video",
    label: "Text to Video",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "text",
    paramMappings: {
        text: {
            sources: [
                upstreamParam("textNode", "texts[0]"),
                configParam("query"),
            ],
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
                staticParam(576),
            ],
        },
        duration: {
            sources: [configParam("duration"), staticParam("5")],
        },
    },
};

const TextGenVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");

    // 上游连接检测（仅用于 UI：提示词输入是否应禁用）
    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const hasUpstreamText = useMemo(() => {
        if (!nodeId) return false;
        const incoming = edges.filter((e) => e.target === nodeId);
        return incoming.some(
            (e) => nodeLookup.get(e.source)?.type === "textNode",
        );
    }, [edges, nodeLookup, nodeId]);

    const [state, setState] = useNodeState(
        {
            query: "",
            selectedAspectRatio: aspectRatios[1],
            duration: "5",
        },
        data,
    );
    const { query, selectedAspectRatio, duration } = state;

    const localTexts: string[] = (data as any)?.texts || [];
    const executeDisabled =
        !hasUpstreamText && !localTexts.length && !query.trim();

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.textGenVideo"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: tActions("generateVideo"),
                executeDisabled,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const texts =
                        upstreamTexts && upstreamTexts.length > 0
                            ? upstreamTexts
                            : localTexts.length > 0
                              ? localTexts
                              : query.trim()
                                ? [query.trim()]
                                : [];

                    return texts.map((text) => ({
                        text,
                        width: selectedAspectRatio.width,
                        height: selectedAspectRatio.height,
                        duration,
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    rows={4}
                    placeholder={
                        hasUpstreamText
                            ? t("common.fromUpstreamText")
                            : t("common.videoDesc")
                    }
                    value={query}
                    onChange={(value) => setState({ query: value })}
                    disabled={hasUpstreamText}
                />

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
                isConnectable
            />
            <Handle
                type="source"
                position={Position.Right}
                id="b"
                isConnectable
            />
        </BaseNode>
    );
};

TextGenVideoNode.displayName = "TextGenVideoNode";

export default memo(TextGenVideoNode);
