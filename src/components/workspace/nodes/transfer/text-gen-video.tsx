"use client";

import {
    useNodeId,
    useStore,
} from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import type { Edge } from "@xyflow/react";
import { memo, useMemo } from "react";
import { Atom } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { DurationPicker } from "../base/duration-picker";
import { NodeTextarea } from "../base/node-textarea";
import { useNodeState } from "@/hooks/use-node-data";
import {
    upstreamParam,
    configParam,
    staticParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS } from "@/constants/media-options";
import { useTranslations } from "next-intl";

// Workflow execution config (BaseNode wires this automatically)
const workflowConfig = {
    feature: "text-gen-video",
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

const TextGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"text-gen-video", "textGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");

    // Upstream connection detection (UI only: whether the prompt input should be disabled)
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
            selectedAspectRatio: VIDEO_ASPECT_RATIOS[1],
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

                <AspectRatioPicker
                    ratios={VIDEO_ASPECT_RATIOS}
                    value={selectedAspectRatio}
                    onChange={(ratio) => setState({ selectedAspectRatio: ratio })}
                    showSize
                />

                <DurationPicker
                    durations={VIDEO_DURATIONS}
                    value={duration}
                    onChange={(dur) => setState({ duration: dur })}
                />
            </div>
        </BaseNode>
    );
};

TextGenVideoNode.displayName = "TextGenVideoNode";

export default memo(TextGenVideoNode);
