import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo } from "react";

import {
    type AspectRatio,
    VIDEO_ASPECT_RATIOS,
    VIDEO_DURATION_DEFAULT,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { parseTargetHandleId } from "@/lib/abi/handle-introspect";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import type { SourceSpec } from "@/lib/abi/sources";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { NodeTextarea } from "../base/node-textarea";
import { VideoDurationSlider } from "../base/video-duration-slider";

// `text` is a config field on this transfer node (manual prompt). Image+audio
// wired upstream uses `imageGenVideoComposeNode` (default handles).
const IMAGE_GEN_VIDEO_TRANSFER_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.imageGenVideoNode as SourceSpec<"image-gen-video">;

const ImageGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-gen-video", "imageGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm(
        "image-gen-video",
        IMAGE_GEN_VIDEO_TRANSFER_SOURCE_SPEC,
    );

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const hasImageInput = useMemo(() => {
        if (!nodeId) return false;
        return edges.some((edge) => {
            if (edge.target !== nodeId) return false;
            if (parseTargetHandleId(edge.targetHandle) !== "image")
                return false;
            const source = nodeLookup.get(edge.source);
            if (source?.type !== "imageNode") return false;
            const keys = coerceBaseNodeData(source.data).fileKeys;
            return (keys?.length ?? 0) > 0;
        });
    }, [nodeId, edges, nodeLookup]);

    const promptText = (form.state.text as string | undefined)?.trim() ?? "";

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
            sourceSpec={IMAGE_GEN_VIDEO_TRANSFER_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageGenVideo")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={tActions("generateVideo")}
            executeDisabled={!hasImageInput || !promptText}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    rows={4}
                    placeholder={t("common.videoDesc")}
                    {...form.bind("text")}
                />

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

ImageGenVideoNode.displayName = "ImageGenVideoNode";

export default memo(ImageGenVideoNode);
