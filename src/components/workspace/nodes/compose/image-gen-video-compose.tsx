import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Atom, Image as ImageIcon, Type } from "lucide-react";
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
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { VideoDurationSlider } from "../base/video-duration-slider";

/** Same ABI slot as transfer image-gen-video; both inputs from upstream handles. */
const IMAGE_GEN_VIDEO_COMPOSE_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.imageGenVideoComposeNode as SourceSpec<"image-gen-video">;

const ImageGenVideoComposeNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-gen-video", "imageGenVideoComposeNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm(
        "image-gen-video",
        IMAGE_GEN_VIDEO_COMPOSE_SOURCE_SPEC,
    );

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () =>
            resolveSpec("image-gen-video", IMAGE_GEN_VIDEO_COMPOSE_SOURCE_SPEC),
        [],
    );

    const { hasText, hasImage, promptText } = useMemo(() => {
        if (!nodeId) {
            return { hasText: false, hasImage: false, promptText: "" };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        const text = typeof values.text === "string" ? values.text.trim() : "";
        const images = Array.isArray(values.image) ? values.image : [];
        return {
            hasText: text.length > 0,
            hasImage: images.length > 0,
            promptText: text,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    const width = (form.state.width as number | undefined) ?? 1024;
    const height = (form.state.height as number | undefined) ?? 576;
    const durationSeconds =
        (form.state.duration as number | undefined) ?? VIDEO_DURATION_DEFAULT;

    useEffect(() => {
        if (form.state.duration === undefined)
            form.set("duration", VIDEO_DURATION_DEFAULT);
    }, [form.state.duration, form.set]);

    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[0];

    return (
        <AbiNodeShell
            feature="image-gen-video"
            sourceSpec={IMAGE_GEN_VIDEO_COMPOSE_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageGenVideoCompose")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={tActions("generateVideo")}
            executeDisabled={!hasText || !hasImage}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t("compose.connectTextImage")}
                        </p>
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center gap-1.5">
                                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                    <div className="flex items-center justify-center h-full w-full bg-green-50">
                                        <Type className="w-6 h-6 text-green-600" />
                                    </div>
                                </div>
                                <div className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                                    {t("compose.text")}
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-1.5">
                                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                    <div className="flex items-center justify-center h-full w-full bg-blue-50">
                                        <ImageIcon className="w-6 h-6 text-blue-600" />
                                    </div>
                                </div>
                                <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                    {t("compose.image")}
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                {promptText ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("common.videoDesc")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3">
                                {promptText}
                            </div>
                        </div>
                    </Card>
                ) : null}

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

ImageGenVideoComposeNode.displayName = "ImageGenVideoComposeNode";

export default memo(ImageGenVideoComposeNode);
