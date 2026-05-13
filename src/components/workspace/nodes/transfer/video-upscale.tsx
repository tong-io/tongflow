"use client";

import { Maximize2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import { cn } from "@/lib/utils";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

type UpscaleTier = "1k" | "2k";

const UPSCALE_TIERS: {
    value: UpscaleTier;
    labelKey: "upscaleTier1k" | "upscaleTier2k";
}[] = [
    { value: "1k", labelKey: "upscaleTier1k" },
    { value: "2k", labelKey: "upscaleTier2k" },
];

const VideoUpscaleNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"video-upscale", "videoUpscaleNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("video-upscale");
    const fileKeys = data.fileKeys ?? [];

    const stateResolution = form.state.resolution as string | undefined;
    const resolution =
        stateResolution === "1k" || stateResolution === "2k"
            ? stateResolution
            : "2k";

    return (
        <AbiNodeShell
            feature="video-upscale"
            sourceSpec={{ video: batchOn() }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.videoUpscale")}
            icon={<Sparkles className="h-5 w-5" />}
            executeLabel={t("actions.startUpscale")}
            executeDisabled={!fileKeys?.length}
        >
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
                                resolution === tier.value
                                    ? "default"
                                    : "outline"
                            }
                            size="sm"
                            onClick={() => form.set("resolution", tier.value)}
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
        </AbiNodeShell>
    );
};

export default memo(VideoUpscaleNode);
