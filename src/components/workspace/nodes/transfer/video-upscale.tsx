"use client";

import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useEffect } from "react";
import { Sparkles, Maximize2 } from "lucide-react";

import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getR2Url } from "@/lib/r2-utils";
import { useNodeState } from "@/hooks/use-node-data";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";

const DEFAULT_FEATURE = "video_upscale";

type UpscaleTier = "1k" | "2k";

const UPSCALE_TIERS: {
    value: UpscaleTier;
    labelKey: "upscaleTier1k" | "upscaleTier2k";
}[] = [
    { value: "1k", labelKey: "upscaleTier1k" },
    { value: "2k", labelKey: "upscaleTier2k" },
];

// 工作流执行配置
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "视频高清放大",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "video",
    paramMappings: {
        video: {
            sources: [
                upstreamParam("videoNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
    },
};

const VideoUpscaleNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const nodeId = useNodeId()!;
    const { fileKeys = [] } = data as { fileKeys?: string[] };

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        [DEFAULT_FEATURE],
        DEFAULT_FEATURE,
    );

    const [state, setState] = useNodeState<{ resolution: UpscaleTier | "4k" }>(
        { resolution: "2k" },
        data,
    );
    useEffect(() => {
        if (state.resolution === "4k") {
            setState({ resolution: "2k" });
        }
    }, [state.resolution, setState]);

    const resolution: UpscaleTier =
        state.resolution === "1k" || state.resolution === "2k"
            ? state.resolution
            : "2k";

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: featureName,
                title: t("titles.videoUpscale"),
                icon: <Sparkles className="h-5 w-5" />,
                executeLabel: t("actions.startUpscale"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "videoNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return keys.map((fileKey) => ({
                        video: getR2Url(fileKey),
                        resolution,
                    }));
                },
            }}
        >
            <div className="px-4 pt-4 space-y-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(value) =>
                        updates(nodeId, { ...data, feature: value })
                    }
                    options={singleModelSelectOptions(DEFAULT_FEATURE, (k) =>
                        t(k as Parameters<typeof t>[0]),
                    )}
                />
            </div>
            <Card className="mx-4 mb-4 p-3 space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Maximize2 className="h-4 w-4" />
                    {t("common.upscaleTierLabel")}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                    {UPSCALE_TIERS.map((tier) => (
                        <Button
                            key={tier.value}
                            variant={
                                resolution === tier.value ? "default" : "outline"
                            }
                            size="sm"
                            onClick={() =>
                                setState({ resolution: tier.value })
                            }
                            className={cn(
                                "h-auto py-2 px-1 flex flex-col gap-0.5 text-xs",
                                resolution === tier.value
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : "hover:bg-accent",
                            )}
                        >
                            <span className="font-medium">
                                {t(`common.${tier.labelKey}`)}
                            </span>
                        </Button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground leading-snug">
                    {t("common.upscaleTierHint")}
                </p>
                {fileKeys?.length > 0 && (
                    <div className="text-xs text-gray-500 pt-1 border-t">
                        {t("video.fileCount")} {fileKeys.length}
                    </div>
                )}
            </Card>

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

export default memo(VideoUpscaleNode);
