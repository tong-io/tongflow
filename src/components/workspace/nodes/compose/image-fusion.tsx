import { useNodeId, useNodesData } from "@xyflow/react";
import { Combine, Maximize2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    type AspectRatio,
    IMAGE_ASPECT_RATIOS,
} from "@/constants/media-options";
import useFlow from "@/hooks/use-flow";
import { useNodeState } from "@/hooks/use-node-data";
import { cn } from "@/lib/utils";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { coerceBaseNodeData } from "@/utils/flow-node-data";
import {
    configParam,
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { BaseNode } from "../base/base-node";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

const resolutions = [
    { value: "512", key: "res512", label: "512" },
    { value: "1K", key: "res1K", label: "1K" },
    { value: "2K", key: "res2K", label: "2K" },
    { value: "4K", key: "res4K", label: "4K" },
];

const DEFAULT_FEATURE = "image-fusion";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "图片融合", // Static label, usually overridden by UI
    outputType: "imageNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        fileKeys: {
            sources: [
                upstreamParam("imageNode", "fileKeys", {
                    collectAll: true,
                }),
            ],
            required: true,
        },
        text: {
            // Get the user-entered prompt from userPrompt (not overwritten by BaseNode)
            sources: [configParam("userPrompt")],
        },
    },
};

const ImageFusionNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-fusion", "imageFusionNode">) => {
    const t = useTranslations("Workspace.nodes");
    const ids = data.ids ?? [];
    const selectedAspectRatio = data.selectedAspectRatio;
    const selectedResolution = data.selectedResolution as
        | (typeof resolutions)[0]
        | undefined;
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const fromNodes = useNodesData(ids);

    // Select aspect ratio
    const handleSelectRatio = useCallback(
        (ratio: AspectRatio) => {
            updates(id, {
                ...data,
                selectedAspectRatio: ratio,
            });
        },
        [id, data, updates],
    );

    // Select resolution
    const handleSelectResolution = useCallback(
        (res: (typeof resolutions)[0]) => {
            updates(id, {
                ...data,
                selectedResolution: res,
            });
        },
        [id, data, updates],
    );

    // Currently selected aspect ratio
    const currentRatio = selectedAspectRatio ?? IMAGE_ASPECT_RATIOS[2]; // Default 1:1
    // Currently selected resolution
    const currentResolution = selectedResolution ?? resolutions[1]; // Default 1080p (1K)

    // Get fileKeys from all image nodes
    const allImages = fromNodes
        .filter((node) => node.type === "imageNode")
        .map((node) => coerceBaseNodeData(node.data).fileKeys)
        .filter((keys): keys is string[] => !!keys && keys.length > 0);

    // Get textNode text from the composite node
    const textNode = fromNodes.find((node) => node.type === "textNode");
    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) {
            return coerceBaseNodeData(textNode?.data).texts || [];
        }
        return [];
    }, [textNode]);

    // Determine whether there is upstream text input
    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;

    // Use the new hook to manage state persistence
    // Use the userPrompt field to avoid conflicts with the prompt object saved by BaseNode
    const [state, setState] = useNodeState(
        {
            userPrompt: "",
        },
        data,
    );
    // Ensure userPrompt is a string
    const userPrompt =
        typeof state.userPrompt === "string" ? state.userPrompt : "";

    // Get the prompt that will actually be used
    const effectivePrompt = hasUpstreamTexts ? upstreamTexts[0] : userPrompt;

    // Textarea ref for cursor position
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Insert the image reference at the cursor position
    const insertImageRef = useCallback(
        (imageRef: string) => {
            if (!textareaRef.current) return;

            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentText = userPrompt;

            const newText =
                currentText.substring(0, start) +
                imageRef +
                currentText.substring(end);
            setState({ userPrompt: newText });

            // Restore the cursor position
            setTimeout(() => {
                textarea.focus();
                const newCursorPos = start + imageRef.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        },
        [userPrompt, setState],
    );

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.imageFusion"),
                icon: <Combine className="h-5 w-5" />,
                executeLabel: t("actions.startFusion"),
                executeDisabled: !allImages || allImages.length < 2,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamImages = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[];
                    const imageKeys = upstreamImages?.length
                        ? upstreamImages
                        : allImages.flat();
                    if (!imageKeys || imageKeys.length < 2) return [];

                    const ctxUpstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const text =
                        ctxUpstreamTexts && ctxUpstreamTexts.length > 0
                            ? ctxUpstreamTexts[0]
                            : effectivePrompt;

                    return [
                        {
                            images: imageKeys,
                            text,
                            width: currentRatio.width,
                            height: currentRatio.height,
                        },
                    ];
                },
            }}
        >
            <div className="p-4 space-y-4">
                <AspectRatioPicker
                    ratios={IMAGE_ASPECT_RATIOS}
                    value={currentRatio}
                    onChange={handleSelectRatio}
                    showSize
                />

                {/* Resolution selection */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Maximize2 className="h-4 w-4" />
                            {t("common.resolution")}
                        </Label>
                        <div className="grid grid-cols-4 gap-2">
                            {resolutions.map((res) => (
                                <Button
                                    key={res.value}
                                    variant={
                                        currentResolution.value === res.value
                                            ? "default"
                                            : "outline"
                                    }
                                    size="sm"
                                    onClick={() => handleSelectResolution(res)}
                                    className={cn(
                                        "h-auto py-2 px-2 text-xs transition-all",
                                        currentResolution.value === res.value
                                            ? "bg-primary text-primary-foreground shadow-md"
                                            : "hover:bg-accent hover:text-accent-foreground",
                                    )}
                                >
                                    {res.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                </Card>

                {/* Image thumbnail selection area */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("imageFusion.imageReference")}
                            <span className="ml-2 text-xs font-normal">
                                ({allImages.length}/14)
                            </span>
                        </Label>
                        <div className="flex gap-3 flex-wrap">
                            {allImages.slice(0, 14).map((images, index) => (
                                <MediaThumbnail
                                    key={index}
                                    fileKey={images[0]}
                                    label={`${t("imageFusion.imageLabel")}${index + 1}`}
                                    type="image"
                                    onClick={() =>
                                        insertImageRef(
                                            `${t("imageFusion.imageLabel")}${index + 1}`,
                                        )
                                    }
                                />
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {allImages.length > 14
                                ? t("imageFusion.maxImagesWarning")
                                : t("imageFusion.imageReferenceHint")}
                        </p>
                    </div>
                </Card>

                {/* Fusion prompt input - show a preview when upstream text exists */}
                {hasUpstreamTexts ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Sparkles className="h-4 w-4" />
                                {t("imageFusion.fusionPrompt")}
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
                    <Card className="p-3">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Sparkles className="h-4 w-4" />
                                {t("imageFusion.fusionPrompt")}
                            </Label>
                            <NodeTextarea
                                ref={textareaRef}
                                showCard={false}
                                placeholder={t(
                                    "imageFusion.fusionPromptPlaceholder",
                                )}
                                value={userPrompt}
                                onChange={(value) =>
                                    setState({ userPrompt: value })
                                }
                                rows={4}
                            />
                        </div>
                    </Card>
                )}
            </div>
        </BaseNode>
    );
};

export default memo(ImageFusionNode);
