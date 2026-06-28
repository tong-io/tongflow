import { useNodesData } from "@xyflow/react";
import { Combine, Maximize2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    type AspectRatio,
    IMAGE_ASPECT_RATIOS,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import type { SourceSpec } from "@/lib/abi/sources";
import { cn } from "@/lib/utils";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

const resolutions = [
    { value: "512", key: "res512", label: "512" },
    { value: "1K", key: "res1K", label: "1K" },
    { value: "2K", key: "res2K", label: "2K" },
    { value: "4K", key: "res4K", label: "4K" },
];

// `images` collects every connected image edge. `text` may come from an upstream
// textNode (via the auto-rendered `in:text` handle) or be typed manually — the
// upstream edge wins, the textarea value is the fallback (`manual: true`).
// Defined centrally in NODE_TYPE_SOURCE_SPEC so compose-time edge creation
// assigns the correct `in:text` targetHandle (matching sibling compose nodes).
const sourceSpec =
    NODE_TYPE_SOURCE_SPEC.imageFusionNode as SourceSpec<"image-fusion">;

const ImageFusionNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-fusion", "imageFusionNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-fusion", sourceSpec);

    const ids = data.ids ?? [];
    const fromNodes = useNodesData(ids);

    const allImages = fromNodes
        .filter((node) => node.type === "imageNode")
        .map((node) => coerceBaseNodeData(node.data).fileKeys)
        .filter((keys): keys is string[] => !!keys && keys.length > 0);

    const textNode = fromNodes.find((node) => node.type === "textNode");
    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) return coerceBaseNodeData(textNode?.data).texts || [];
        return [];
    }, [textNode]);
    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;

    const width = (form.state.width as number | undefined) ?? 1024;
    const height = (form.state.height as number | undefined) ?? 1024;
    const currentRatio: AspectRatio =
        IMAGE_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? IMAGE_ASPECT_RATIOS[2];

    // UI-only resolution toggle (not part of ABI inputs).
    const [currentResolution, setCurrentResolution] = useState(
        () =>
            (data.selectedResolution as (typeof resolutions)[0] | undefined) ??
            resolutions[1],
    );

    const userPrompt = (form.state.text as string | undefined) ?? "";
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertImageRef = useCallback(
        (imageRef: string) => {
            if (!textareaRef.current) return;
            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newText =
                userPrompt.substring(0, start) +
                imageRef +
                userPrompt.substring(end);
            form.set("text", newText);
            setTimeout(() => {
                textarea.focus();
                const newCursorPos = start + imageRef.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        },
        [userPrompt, form],
    );

    return (
        <AbiNodeShell
            feature="image-fusion"
            sourceSpec={sourceSpec}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageFusion")}
            icon={<Combine className="h-5 w-5" />}
            executeLabel={t("actions.startFusion")}
            executeDisabled={!allImages || allImages.length < 2}
        >
            <div className="p-4 space-y-4">
                <AspectRatioPicker
                    ratios={IMAGE_ASPECT_RATIOS}
                    value={currentRatio}
                    onChange={(ratio) =>
                        form.patch({ width: ratio.width, height: ratio.height })
                    }
                    showSize
                />

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
                                    onClick={() => setCurrentResolution(res)}
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
                                {...form.bind("text")}
                                rows={4}
                            />
                        </div>
                    </Card>
                )}
            </div>
        </AbiNodeShell>
    );
};

export default memo(ImageFusionNode);
