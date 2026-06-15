import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Music, Type, Video } from "lucide-react";
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

const SPEECH_TEXT_GEN_VIDEO_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.speechTextGenVideoNode as SourceSpec<"speech-text-gen-video">;

const SpeechTextGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "speech-text-gen-video",
    "speechTextGenVideoNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm(
        "speech-text-gen-video",
        SPEECH_TEXT_GEN_VIDEO_SOURCE_SPEC,
    );

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () =>
            resolveSpec(
                "speech-text-gen-video",
                SPEECH_TEXT_GEN_VIDEO_SOURCE_SPEC,
            ),
        [],
    );

    const { hasText, hasAudio, promptText, audioFileKey } = useMemo(() => {
        if (!nodeId) {
            return {
                hasText: false,
                hasAudio: false,
                promptText: "",
                audioFileKey: undefined as string | undefined,
            };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        const text = typeof values.text === "string" ? values.text.trim() : "";
        const audio =
            typeof values.audio === "string" ? values.audio : undefined;
        return {
            hasText: text.length > 0,
            hasAudio: Boolean(audio),
            promptText: text,
            audioFileKey: audio,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    return (
        <AbiNodeShell
            feature="speech-text-gen-video"
            sourceSpec={SPEECH_TEXT_GEN_VIDEO_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.speechTextGenVideo")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={tActions("generateVideo")}
            executeDisabled={!hasText || !hasAudio}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <div className="flex gap-4">
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
                            {audioFileKey ? (
                                <MediaThumbnail
                                    fileKey={audioFileKey}
                                    label={t("compose.referenceAudio")}
                                    type="audio"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                        <div className="flex items-center justify-center h-full w-full bg-blue-50">
                                            <Music className="w-6 h-6 text-blue-600" />
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                        {t("compose.referenceAudio")}
                                    </div>
                                </div>
                            )}
                        </div>
                        {(!hasText || !hasAudio) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectTextAudioNode")}
                            </p>
                        )}
                    </div>
                </Card>

                {hasText ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("compose.inputText")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3">
                                {promptText}
                            </div>
                        </div>
                    </Card>
                ) : null}
            </div>
        </AbiNodeShell>
    );
};

SpeechTextGenVideoNode.displayName = "SpeechTextGenVideoNode";

export default memo(SpeechTextGenVideoNode);
