import type { Edge } from "@xyflow/react";
import { useNodeId, useNodesData, useStore } from "@xyflow/react";
import { MessageSquare, Music, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useAbiForm } from "@/hooks/use-abi-form";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

const DEFAULT_STRENGTH = 0.8;

const MusicCoverNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"music-cover", "musicCoverNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("music-cover");

    const nodeId = useNodeId();
    const edges = useStore((state) => state.edges as Edge[]);

    const { audioSourceId, refAudioSourceId } = useMemo(() => {
        if (!nodeId) return { audioSourceId: null, refAudioSourceId: null };
        let audioSrc: string | null = null;
        let refAudioSrc: string | null = null;
        for (const e of edges) {
            if (e.target !== nodeId) continue;
            if (e.targetHandle === "in:audio") audioSrc = e.source;
            else if (e.targetHandle === "in:ref_audio") refAudioSrc = e.source;
        }
        return { audioSourceId: audioSrc, refAudioSourceId: refAudioSrc };
    }, [edges, nodeId]);

    const upstreamIds = useMemo(
        () => [audioSourceId, refAudioSourceId].filter((v): v is string => !!v),
        [audioSourceId, refAudioSourceId],
    );
    const upstreamNodes = useNodesData(upstreamIds);

    const audioKey = useMemo(() => {
        if (!audioSourceId) return undefined;
        const n = upstreamNodes.find((u) => u.id === audioSourceId);
        if (!n || n.type !== "audioNode") return undefined;
        return coerceBaseNodeData(n.data).fileKeys?.[0];
    }, [audioSourceId, upstreamNodes]);

    const refAudioKey = useMemo(() => {
        if (!refAudioSourceId) return undefined;
        const n = upstreamNodes.find((u) => u.id === refAudioSourceId);
        if (!n || n.type !== "audioNode") return undefined;
        return coerceBaseNodeData(n.data).fileKeys?.[0];
    }, [refAudioSourceId, upstreamNodes]);

    const strength =
        (form.state.strength as number | undefined) ?? DEFAULT_STRENGTH;

    // Persist the default so the workflow exporter / runtime sees the same
    // value the user sees in the UI.
    useEffect(() => {
        if (form.state.strength == null)
            form.set("strength", DEFAULT_STRENGTH, { history: false });
    }, [form.state.strength, form.set]);

    return (
        <AbiNodeShell
            feature="music-cover"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.musicCover")}
            icon={<Palette className="h-5 w-5" />}
            executeLabel={t("actions.coverMusic")}
            executeDisabled={!audioSourceId}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <div className="flex gap-4">
                            {audioKey ? (
                                <MediaThumbnail
                                    fileKey={audioKey}
                                    label={t("musicTasks.sourceAudio")}
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
                                        {t("musicTasks.sourceAudio")}
                                    </div>
                                </div>
                            )}
                            {refAudioKey && (
                                <MediaThumbnail
                                    fileKey={refAudioKey}
                                    label={t("musicTasks.refAudio")}
                                    type="audio"
                                />
                            )}
                        </div>
                    </div>
                </Card>
                <NodeTextarea
                    label={t("musicTasks.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("musicTasks.promptPlaceholder")}
                    {...form.bind("text")}
                    rows={3}
                />
                <NodeTextarea
                    label={t("musicTasks.lyricsLabel")}
                    placeholder={t("musicTasks.lyricsPlaceholder")}
                    {...form.bind("lyrics")}
                    rows={2}
                />
                <Card className="p-3">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("musicTasks.strength")}
                            </Label>
                            <span className="text-xs font-medium">
                                {strength.toFixed(2)}
                            </span>
                        </div>
                        <Slider
                            value={[strength]}
                            onValueChange={([v]) => form.set("strength", v)}
                            min={0}
                            max={1}
                            step={0.05}
                            className="w-full"
                        />
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

MusicCoverNode.displayName = "MusicCoverNode";

export default memo(MusicCoverNode);
