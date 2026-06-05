import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Sparkles, Type, Video } from "lucide-react";
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
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

const SPEECH_VIDEO_GEN_VIDEO_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.speechVideoGenVideoNode as SourceSpec<"speech-video-gen-video">;

const SpeechVideoGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "speech-video-gen-video",
    "speechVideoGenVideoNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm(
        "speech-video-gen-video",
        SPEECH_VIDEO_GEN_VIDEO_SOURCE_SPEC,
    );

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () =>
            resolveSpec(
                "speech-video-gen-video",
                SPEECH_VIDEO_GEN_VIDEO_SOURCE_SPEC,
            ),
        [],
    );

    const { hasVideo, hasText, videoFileKey, promptText } = useMemo(() => {
        if (!nodeId) {
            return {
                hasVideo: false,
                hasText: false,
                videoFileKey: undefined as string | undefined,
                promptText: "",
            };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        const text = typeof values.text === "string" ? values.text.trim() : "";
        const video =
            typeof values.video === "string" ? values.video : undefined;
        return {
            hasVideo: Boolean(video),
            hasText: text.length > 0,
            videoFileKey: video,
            promptText: text,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    const manualText = (form.state.text as string | undefined)?.trim() ?? "";
    const effectiveText = promptText || manualText;

    return (
        <AbiNodeShell
            feature="speech-video-gen-video"
            sourceSpec={SPEECH_VIDEO_GEN_VIDEO_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.speechVideoGenVideo")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={tActions("lipDub")}
            executeDisabled={!hasVideo || !effectiveText}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t("compose.connectTextVideoNode")}
                        </p>
                        <div className="flex gap-4">
                            {videoFileKey ? (
                                <MediaThumbnail
                                    fileKey={videoFileKey}
                                    label={t("compose.video")}
                                    type="video"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                        <div className="flex items-center justify-center h-full w-full bg-purple-50">
                                            <Video className="w-6 h-6 text-purple-600" />
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                        {t("compose.video")}
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col items-center gap-1.5">
                                <div
                                    className={`relative w-16 h-16 rounded-md border-2 overflow-hidden ${
                                        hasText
                                            ? "border-green-400"
                                            : "border-gray-300"
                                    }`}
                                >
                                    <div className="flex items-center justify-center h-full w-full bg-green-50">
                                        <Type className="w-6 h-6 text-green-600" />
                                    </div>
                                </div>
                                <div className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                                    {t("compose.text")}
                                </div>
                            </div>
                        </div>
                        {(!hasVideo || !hasText) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectTextVideoNode")}
                            </p>
                        )}
                    </div>
                </Card>

                {promptText ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("lipDub.targetDialogue")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-4">
                                {promptText}
                            </div>
                        </div>
                    </Card>
                ) : (
                    <NodeTextarea
                        label={t("lipDub.targetDialogue")}
                        icon={Sparkles}
                        placeholder={t("lipDub.targetDialoguePlaceholder")}
                        {...form.bind("text")}
                        rows={4}
                    />
                )}

                <p className="text-xs text-muted-foreground">
                    {t("lipDub.promptHint")}
                </p>
            </div>
        </AbiNodeShell>
    );
};

SpeechVideoGenVideoNode.displayName = "SpeechVideoGenVideoNode";

export default memo(SpeechVideoGenVideoNode);
