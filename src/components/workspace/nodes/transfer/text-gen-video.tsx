"use client";

import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import {
    type AspectRatio,
    VIDEO_ASPECT_RATIOS,
    VIDEO_DURATIONS,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { DurationPicker } from "../base/duration-picker";
import { NodeTextarea } from "../base/node-textarea";

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

    const hasUpstreamText = useMemo(() => {
        if (!nodeId) return false;
        const incoming = edges.filter((e) => e.target === nodeId);
        return incoming.some(
            (e) => nodeLookup.get(e.source)?.type === "textNode",
        );
    }, [edges, nodeLookup, nodeId]);

    const localText = (form.state.text as string | undefined) ?? "";
    const localTexts: string[] = (data as any)?.texts || [];
    const executeDisabled =
        !hasUpstreamText && !localTexts.length && !localText.trim();

    const width = (form.state.width as number | undefined) ?? 1024;
    const height = (form.state.height as number | undefined) ?? 576;
    const duration = (form.state.duration as string | undefined) ?? "5";

    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[1];

    return (
        <AbiNodeShell
            feature="text-gen-video"
            sourceSpec={{
                text: batchOn({ nodeType: "textNode", path: "texts" }),
            }}
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
                <NodeTextarea
                    rows={4}
                    placeholder={
                        hasUpstreamText
                            ? t("common.fromUpstreamText")
                            : t("common.videoDesc")
                    }
                    {...form.bind("text")}
                    disabled={hasUpstreamText}
                />

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
                    value={duration}
                    onChange={(dur) => form.set("duration", dur)}
                />
            </div>
        </AbiNodeShell>
    );
};

TextGenVideoNode.displayName = "TextGenVideoNode";

export default memo(TextGenVideoNode);
