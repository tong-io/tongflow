"use client";

import { Maximize2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useNodeState } from "@/hooks/use-node-data";
import { cn } from "@/lib/utils";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

const DEFAULT_FEATURE = "image-upscale";

type UpscaleTier = "1k" | "2k" | "4k";

const UPSCALE_TIERS: {
    value: UpscaleTier;
    labelKey: "upscaleTier1k" | "upscaleTier2k" | "upscaleTier4k";
}[] = [
    { value: "1k", labelKey: "upscaleTier1k" },
    { value: "2k", labelKey: "upscaleTier2k" },
    { value: "4k", labelKey: "upscaleTier4k" },
];

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "imageNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "image",
    paramMappings: {
        image: {
            sources: [upstreamParam("imageNode", "fileKeys[0]")],
            required: true,
        },
    },
};

const ImageGenImageUpscaleNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-upscale", "imageGenImageUpscaleNode">) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys ?? [];

    const [state, setState] = useNodeState<{ resolution: UpscaleTier }>(
        { resolution: "2k" },
        data,
    );
    const { resolution } = state;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.imageUpscale"),
                icon: <Sparkles className="h-5 w-5" />,
                executeLabel: t("actions.imageUpscale"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return keys.map((fileKey) => ({
                        image: fileKey,
                        resolution,
                    }));
                },
            }}
        >
            <div className="p-4 pt-0 space-y-3">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Maximize2 className="h-4 w-4" />
                            {t("common.upscaleTierLabel")}
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                            {UPSCALE_TIERS.map((tier) => (
                                <Button
                                    key={tier.value}
                                    variant={
                                        resolution === tier.value
                                            ? "default"
                                            : "outline"
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
                    </div>
                </Card>
            </div>
        </BaseNode>
    );
};

ImageGenImageUpscaleNode.displayName = "ImageGenImageUpscaleNode";

export default memo(ImageGenImageUpscaleNode);
