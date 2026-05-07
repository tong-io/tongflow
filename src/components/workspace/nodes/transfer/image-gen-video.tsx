import type { Edge } from "@xyflow/react";
import { useNodeId, useNodesData, useStore } from "@xyflow/react";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    VIDEO_ASPECT_RATIOS,
    VIDEO_DURATIONS,
} from "@/constants/media-options";
import { useNodeState } from "@/hooks/use-node-data";
import { getFileUrl } from "@/lib/file-url";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { coerceBaseNodeData } from "@/utils/flow-node-data";
import {
    configParam,
    type GetPromptsContext,
    staticParam,
    upstreamParam,
} from "@/utils/node-execution-config";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { BaseNode } from "../base/base-node";
import { DurationPicker } from "../base/duration-picker";
import { NodeTextarea } from "../base/node-textarea";

// Workflow execution config (BaseNode wires this automatically)
const workflowConfig = {
    feature: "image-gen-video",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "image",
    paramMappings: {
        image: {
            sources: [
                upstreamParam("imageNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
        text: {
            sources: [
                upstreamParam("textNode", "texts[0]"),
                configParam("query"),
                staticParam(""),
            ],
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

const ImageGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-gen-video", "imageGenVideoNode">) => {
    const ids = data.ids ?? [];
    const localFileKeys = data.fileKeys ?? [];
    const nodeId = useNodeId();

    // Get edge and node information to detect upstream connections
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    // If ids are present, get data from associated nodes (composition mode)
    const fromNodes = useNodesData(ids);
    const imageNode = fromNodes.find((node) => node.type === "imageNode");
    const textNode = fromNodes.find((node) => node.type === "textNode");

    // Get fileKeys and texts from the composite node or directly from data
    const fileKeys: string[] = useMemo(() => {
        if (imageNode) {
            return coerceBaseNodeData(imageNode.data).fileKeys || [];
        }
        return localFileKeys;
    }, [imageNode, localFileKeys]);

    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) {
            return coerceBaseNodeData(textNode.data).texts || [];
        }
        return data.texts || [];
    }, [textNode, data]);

    // Determine whether there is upstream text input in composition mode
    const hasCompositeText = upstreamTexts && upstreamTexts.length > 0;

    // Detect whether upstream imageNode and textNode connections exist (including composition mode)
    const { hasUpstreamText, upstreamImageHasData } = useMemo(() => {
        // Composition mode already has data
        if (ids.length > 0) {
            return {
                hasUpstreamImage: !!imageNode,
                hasUpstreamText: hasCompositeText,
                upstreamImageHasData: fileKeys.length > 0,
            };
        }

        if (!nodeId)
            return {
                hasUpstreamImage: false,
                hasUpstreamText: false,
                upstreamImageHasData: false,
            };

        const incomingEdges = edges.filter((edge) => edge.target === nodeId);
        let hasImage = false;
        let hasText = false;
        let imageHasData = false;

        for (const edge of incomingEdges) {
            const sourceNode = nodeLookup.get(edge.source);
            if (sourceNode?.type === "imageNode") {
                hasImage = true;
                const nodeKeys = coerceBaseNodeData(sourceNode.data).fileKeys;
                if (nodeKeys?.length) {
                    imageHasData = true;
                }
            }
            if (sourceNode?.type === "textNode") {
                hasText = true;
            }
        }

        return {
            hasUpstreamImage: hasImage,
            hasUpstreamText: hasText,
            upstreamImageHasData: imageHasData,
        };
    }, [nodeId, nodeLookup, edges, ids, imageNode, hasCompositeText, fileKeys]);

    // Use the hook to manage state persistence
    const [state, setState] = useNodeState(
        {
            query: "",
            selectedAspectRatio: VIDEO_ASPECT_RATIOS[0],
            duration: "5",
        },
        data,
    );
    const { query, selectedAspectRatio, duration } = state;
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");

    // Determine whether the button should be disabled: local image data exists or upstream image data exists
    const hasImageData = fileKeys?.length > 0 || upstreamImageHasData;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.imageGenVideo"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: tActions("generateVideo"),
                executeDisabled: !hasImageData,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    // Get text from the upstream text node and prefer it when available
                    const ctxUpstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    // Priority ladder: wired ctx upstream, combo payloads, finally local drafts
                    const text =
                        ctxUpstreamTexts && ctxUpstreamTexts.length > 0
                            ? ctxUpstreamTexts[0]
                            : hasCompositeText
                              ? upstreamTexts[0]
                              : query;
                    return keys.map((fileKey) => ({
                        image: getFileUrl(fileKey),
                        text: text,
                        width: selectedAspectRatio.width,
                        height: selectedAspectRatio.height,
                        duration: duration,
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                {/* Video description input - show a preview when composition-mode upstream text exists */}
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
                        value={query}
                        onChange={(value) => setState({ query: value })}
                        disabled={hasUpstreamText}
                    />
                )}

                <AspectRatioPicker
                    ratios={VIDEO_ASPECT_RATIOS}
                    value={selectedAspectRatio}
                    onChange={(ratio) =>
                        setState({ selectedAspectRatio: ratio })
                    }
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

ImageGenVideoNode.displayName = "ImageGenVideoNode";

export default memo(ImageGenVideoNode);
