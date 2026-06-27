import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Clapperboard, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import { collectHandleValues, resolveSpec } from "@/lib/abi/resolve";
import type { SourceSpec } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const VIDEO_EDIT_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.videoEditNode as SourceSpec<"video-edit">;

const VideoEditNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"video-edit", "videoEditNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("video-edit", VIDEO_EDIT_SOURCE_SPEC);

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () => resolveSpec("video-edit", VIDEO_EDIT_SOURCE_SPEC),
        [],
    );

    const { hasVideo, promptText } = useMemo(() => {
        if (!nodeId) {
            return { hasVideo: false, promptText: "" };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        const text = typeof values.text === "string" ? values.text.trim() : "";
        const videoRaw = values.video;
        const videoKey = Array.isArray(videoRaw)
            ? typeof videoRaw[0] === "string"
                ? videoRaw[0]
                : undefined
            : typeof videoRaw === "string"
              ? videoRaw
              : undefined;
        return {
            hasVideo: Boolean(videoKey),
            promptText: text,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    const manualText = (form.state.text as string | undefined)?.trim() ?? "";
    const effectiveText = promptText || manualText;

    return (
        <AbiNodeShell
            feature="video-edit"
            sourceSpec={VIDEO_EDIT_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.videoEdit")}
            icon={<Clapperboard className="h-5 w-5" />}
            executeLabel={t("actions.editVideo")}
            executeDisabled={!hasVideo || !effectiveText}
        >
            <div className="p-4 space-y-4">
                {!hasVideo && (
                    <p className="text-xs text-red-500">
                        {t("videoEdit.connectTextVideo")}
                    </p>
                )}

                {promptText ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("videoEdit.editInstruction")}
                                {t("videoEdit.fromUpstream")}
                            </Label>
                            <div className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3">
                                {promptText}
                            </div>
                        </div>
                    </Card>
                ) : (
                    <NodeTextarea
                        label={t("videoEdit.editInstruction")}
                        icon={Sparkles}
                        placeholder={t("videoEdit.editPlaceholder")}
                        {...form.bind("text")}
                        rows={4}
                    />
                )}
            </div>
        </AbiNodeShell>
    );
};

VideoEditNode.displayName = "VideoEditNode";

export default memo(VideoEditNode);
