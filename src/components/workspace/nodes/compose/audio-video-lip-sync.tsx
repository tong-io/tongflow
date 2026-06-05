import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Music, Sparkles, Video } from "lucide-react";
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

const AUDIO_VIDEO_LIP_SYNC_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.audioVideoLipSyncNode as SourceSpec<"audio-video-lip-sync">;

const AudioVideoLipSyncNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "audio-video-lip-sync",
    "audioVideoLipSyncNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const tActions = useTranslations("Workspace.nodes.actions");
    const form = useAbiForm(
        "audio-video-lip-sync",
        AUDIO_VIDEO_LIP_SYNC_SOURCE_SPEC,
    );

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () =>
            resolveSpec(
                "audio-video-lip-sync",
                AUDIO_VIDEO_LIP_SYNC_SOURCE_SPEC,
            ),
        [],
    );

    const { hasVideo, hasAudio, videoFileKey, audioFileKey } = useMemo(() => {
        if (!nodeId) {
            return {
                hasVideo: false,
                hasAudio: false,
                videoFileKey: undefined as string | undefined,
                audioFileKey: undefined as string | undefined,
            };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        const video =
            typeof values.video === "string" ? values.video : undefined;
        const audio =
            typeof values.audio === "string" ? values.audio : undefined;
        return {
            hasVideo: Boolean(video),
            hasAudio: Boolean(audio),
            videoFileKey: video,
            audioFileKey: audio,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    return (
        <AbiNodeShell
            feature="audio-video-lip-sync"
            sourceSpec={AUDIO_VIDEO_LIP_SYNC_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.audioVideoLipSync")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={tActions("lipSync")}
            executeDisabled={!hasVideo || !hasAudio}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t("compose.connectVideoAudio")}
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
                            {audioFileKey ? (
                                <MediaThumbnail
                                    fileKey={audioFileKey}
                                    label={t("compose.audio")}
                                    type="audio"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                        <div className="flex items-center justify-center h-full w-full bg-orange-50">
                                            <Music className="w-6 h-6 text-orange-600" />
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                                        {t("compose.audio")}
                                    </div>
                                </div>
                            )}
                        </div>
                        {(!hasVideo || !hasAudio) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectVideoAudio")}
                            </p>
                        )}
                    </div>
                </Card>

                <NodeTextarea
                    label={t("lipSync.scenePrompt")}
                    icon={Sparkles}
                    placeholder={t("lipSync.scenePromptPlaceholder")}
                    {...form.bind("text")}
                    rows={3}
                />

                <p className="text-xs text-muted-foreground">
                    {t("lipSync.audioDrivenHint")}
                </p>
            </div>
        </AbiNodeShell>
    );
};

AudioVideoLipSyncNode.displayName = "AudioVideoLipSyncNode";

export default memo(AudioVideoLipSyncNode);
