"use client";

import type { Edge } from "@xyflow/react";
import { useNodeId, useNodesData, useStore } from "@xyflow/react";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    type AspectRatio,
    VIDEO_ASPECT_RATIOS,
    VIDEO_DURATION_DEFAULT,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import { collectHandleValues, resolveSpec } from "@/lib/abi/resolve";
import type { SourceSpec } from "@/lib/abi/sources";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { NodeTextarea } from "../base/node-textarea";
import { VideoDurationSlider } from "../base/video-duration-slider";

const TEXT_GEN_VIDEO_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.textGenVideoNode as SourceSpec<"text-gen-video">;

const TextGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"text-gen-video", "textGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm("text-gen-video");

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);
    const { ids = [] } = data;

    const resolvedSpec = useMemo(
        () => resolveSpec("text-gen-video", TEXT_GEN_VIDEO_SOURCE_SPEC),
        [],
    );

    const fromNodes = useNodesData(ids);
    const composeTextNode = fromNodes.find((node) => node.type === "textNode");

    const upstreamTexts: string[] = useMemo(() => {
        if (composeTextNode) {
            return coerceBaseNodeData(composeTextNode.data).texts ?? [];
        }
        if (nodeId) {
            const nodes = Array.from(nodeLookup.values());
            const values = collectHandleValues(
                nodeId,
                resolvedSpec,
                nodes,
                edges,
            );
            const text = values.text;
            if (Array.isArray(text)) {
                return text.filter(
                    (item): item is string =>
                        typeof item === "string" && item.trim().length > 0,
                );
            }
            if (typeof text === "string" && text.trim()) return [text];
        }
        return data.texts ?? [];
    }, [composeTextNode, nodeId, nodeLookup, edges, resolvedSpec, data.texts]);

    const hasUpstreamTexts = upstreamTexts.length > 0;

    const localText = (form.state.text as string | undefined) ?? "";
    const executeDisabled = !hasUpstreamTexts && !localText.trim();

    const width = (form.state.width as number | undefined) ?? 1024;
    const height = (form.state.height as number | undefined) ?? 576;
    const durationSeconds =
        (form.state.duration as number | undefined) ?? VIDEO_DURATION_DEFAULT;

    // `duration` is ABI-required; persist the displayed default so execution
    // sends the same seconds the slider shows (otherwise plugins fall back to
    // their own default, often 10s).
    useEffect(() => {
        if (form.state.duration === undefined)
            form.set("duration", VIDEO_DURATION_DEFAULT);
    }, [form.state.duration, form.set]);

    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[1];

    return (
        <AbiNodeShell
            feature="text-gen-video"
            sourceSpec={TEXT_GEN_VIDEO_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.textGenVideo")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={tActions("generateVideo")}
            executeDisabled={executeDisabled}
        >
            <div className="p-4 space-y-4">
                {hasUpstreamTexts ? (
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
                        placeholder={t("common.videoDesc")}
                        {...form.bind("text")}
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

                <VideoDurationSlider
                    value={durationSeconds}
                    onChange={(dur) => form.set("duration", dur)}
                />
            </div>
        </AbiNodeShell>
    );
};

TextGenVideoNode.displayName = "TextGenVideoNode";

export default memo(TextGenVideoNode);
