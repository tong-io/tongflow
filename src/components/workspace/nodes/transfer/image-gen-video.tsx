import type { Edge } from "@xyflow/react";
import { useNodeId, useNodesData, useStore } from "@xyflow/react";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    type AspectRatio,
    VIDEO_ASPECT_RATIOS,
    VIDEO_DURATIONS,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { DurationPicker } from "../base/duration-picker";
import { NodeTextarea } from "../base/node-textarea";

const ImageGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-gen-video", "imageGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm("image-gen-video");

    const ids = data.ids ?? [];
    const localFileKeys = data.fileKeys ?? [];
    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const fromNodes = useNodesData(ids);
    const imageNode = fromNodes.find((node) => node.type === "imageNode");
    const textNode = fromNodes.find((node) => node.type === "textNode");

    const fileKeys: string[] = useMemo(() => {
        if (imageNode) return coerceBaseNodeData(imageNode.data).fileKeys || [];
        return localFileKeys;
    }, [imageNode, localFileKeys]);

    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) return coerceBaseNodeData(textNode.data).texts || [];
        return data.texts || [];
    }, [textNode, data]);

    const hasCompositeText = upstreamTexts && upstreamTexts.length > 0;

    const { hasUpstreamText, upstreamImageHasData } = useMemo(() => {
        if (ids.length > 0) {
            return {
                hasUpstreamText: hasCompositeText,
                upstreamImageHasData: fileKeys.length > 0,
            };
        }
        if (!nodeId)
            return { hasUpstreamText: false, upstreamImageHasData: false };
        const incomingEdges = edges.filter((edge) => edge.target === nodeId);
        let hasText = false;
        let imageHasData = false;
        for (const edge of incomingEdges) {
            const sourceNode = nodeLookup.get(edge.source);
            if (sourceNode?.type === "imageNode") {
                const nodeKeys = coerceBaseNodeData(sourceNode.data).fileKeys;
                if (nodeKeys?.length) imageHasData = true;
            }
            if (sourceNode?.type === "textNode") hasText = true;
        }
        return { hasUpstreamText: hasText, upstreamImageHasData: imageHasData };
    }, [nodeId, nodeLookup, edges, ids, hasCompositeText, fileKeys]);

    const width = (form.state.width as number | undefined) ?? 1024;
    const height = (form.state.height as number | undefined) ?? 576;
    const durationSeconds = (form.state.duration as number | undefined) ?? 5;
    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[0];

    const hasImageData = fileKeys?.length > 0 || upstreamImageHasData;

    return (
        <AbiNodeShell
            feature="image-gen-video"
            sourceSpec={{ image: batchOn() }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageGenVideo")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={tActions("generateVideo")}
            executeDisabled={!hasImageData}
        >
            <div className="p-4 space-y-4">
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
                        {...form.bind("text")}
                        disabled={hasUpstreamText}
                    />
                )}

                <AspectRatioPicker
                    ratios={VIDEO_ASPECT_RATIOS}
                    value={currentRatio}
                    onChange={(ratio) =>
                        form.patch({ width: ratio.width, height: ratio.height })
                    }
                    showSize
                />

                <DurationPicker
                    durations={VIDEO_DURATIONS}
                    value={String(durationSeconds)}
                    onChange={(dur) => form.set("duration", Number(dur))}
                />
            </div>
        </AbiNodeShell>
    );
};

ImageGenVideoNode.displayName = "ImageGenVideoNode";

export default memo(ImageGenVideoNode);
