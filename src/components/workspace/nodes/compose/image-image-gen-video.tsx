import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { ImageIcon, Sparkles, Video } from "lucide-react";
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
import { collectHandleValues, resolveSpec } from "@/lib/abi/resolve";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { DurationPicker } from "../base/duration-picker";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

function FramePlaceholder({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                <div className="flex items-center justify-center h-full w-full bg-blue-50">
                    <ImageIcon className="w-6 h-6 text-blue-600" />
                </div>
            </div>
            <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                {label}
            </div>
        </div>
    );
}

const ImageImageGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "image-image-gen-video",
    "imageImageGenVideoNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-image-gen-video");

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () => resolveSpec("image-image-gen-video", undefined),
        [],
    );

    // First frame (`image`) and last frame (`end_image`) come from upstream
    // image nodes; re-resolve whenever edges or upstream data change.
    const { firstFrameKey, lastFrameKey } = useMemo(() => {
        if (!nodeId) {
            return {
                firstFrameKey: undefined as string | undefined,
                lastFrameKey: undefined as string | undefined,
            };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        return {
            firstFrameKey:
                typeof values.image === "string" ? values.image : undefined,
            lastFrameKey:
                typeof values.end_image === "string"
                    ? values.end_image
                    : undefined,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    const width = (form.state.width as number | undefined) ?? 1280;
    const height = (form.state.height as number | undefined) ?? 704;
    const duration = (form.state.duration as number | undefined) ?? 10;
    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[1];

    return (
        <AbiNodeShell
            feature="image-image-gen-video"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageImageGenVideo")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={t("actions.generateVideo")}
            executeDisabled={!firstFrameKey || !lastFrameKey}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.mediaFiles")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t("compose.connectTwoImages")}
                        </p>
                        <div className="flex flex-wrap gap-4">
                            {firstFrameKey ? (
                                <MediaThumbnail
                                    fileKey={firstFrameKey}
                                    label={t("compose.firstFrame")}
                                    type="image"
                                />
                            ) : (
                                <FramePlaceholder
                                    label={t("compose.firstFrame")}
                                />
                            )}
                            {lastFrameKey ? (
                                <MediaThumbnail
                                    fileKey={lastFrameKey}
                                    label={t("compose.lastFrame")}
                                    type="image"
                                />
                            ) : (
                                <FramePlaceholder
                                    label={t("compose.lastFrame")}
                                />
                            )}
                        </div>
                    </div>
                </Card>

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
                    value={String(duration)}
                    onChange={(dur) => form.set("duration", Number(dur))}
                />

                <NodeTextarea
                    label={t("compose.generatePromptLabel")}
                    icon={Sparkles}
                    placeholder={t("compose.generatePromptPlaceholder")}
                    {...form.bind("text")}
                    rows={4}
                />
            </div>
        </AbiNodeShell>
    );
};

export default memo(ImageImageGenVideoNode);
