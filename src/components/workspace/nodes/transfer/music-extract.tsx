import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Split } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useAbiForm } from "@/hooks/use-abi-form";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

/** Stem/track options shared by the music-extract / music-lego / music-complete nodes. */
export const MUSIC_TRACK_OPTIONS = [
    "vocals",
    "backing_vocals",
    "drums",
    "percussion",
    "bass",
    "guitar",
    "keyboard",
    "synth",
    "strings",
    "brass",
    "woodwinds",
    "fx",
] as const;

const DEFAULT_TRACK = "vocals";

const MusicExtractNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"music-extract", "musicExtractNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("music-extract");

    const nodeId = useNodeId();
    const edges = useStore((state) => state.edges as Edge[]);
    const audioConnected = useMemo(
        () =>
            !!nodeId &&
            edges.some(
                (e) => e.target === nodeId && e.targetHandle === "in:audio",
            ),
        [edges, nodeId],
    );

    const track = (form.state.track as string | undefined) ?? DEFAULT_TRACK;

    // Persist the default so the workflow exporter / runtime sees the same
    // value the user sees in the UI.
    useEffect(() => {
        if (form.state.track == null)
            form.set("track", DEFAULT_TRACK, { history: false });
    }, [form.state.track, form.set]);

    return (
        <AbiNodeShell
            feature="music-extract"
            form={form}
            selected={selected}
            className="min-w-[420px]"
            data={data}
            title={t("titles.musicExtract")}
            icon={<Split className="h-5 w-5" />}
            executeLabel={t("actions.extractStem")}
            executeDisabled={!audioConnected || !track}
        >
            <div className="p-4 space-y-4">
                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            {t("musicTasks.track")}
                        </Label>
                        <Select
                            value={track}
                            onValueChange={(v) => form.set("track", v)}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {MUSIC_TRACK_OPTIONS.map((opt) => (
                                    <SelectItem
                                        key={opt}
                                        value={opt}
                                        className="text-xs"
                                    >
                                        {t(`musicTasks.trackOptions.${opt}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

MusicExtractNode.displayName = "MusicExtractNode";

export default memo(MusicExtractNode);
