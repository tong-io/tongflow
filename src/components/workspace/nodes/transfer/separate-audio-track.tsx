import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback } from "react";
import { useAbiForm } from "@/hooks/use-abi-form";
import useFlow from "@/hooks/use-flow";
import type { Task } from "@/hooks/use-task";
import { batchOn } from "@/lib/abi/sources";
import type { RfDataNodeProps } from "@/types/nodes";

import { AbiNodeShell } from "../base/abi-node-shell";

type SeparateAudioTrackRfProps = RfDataNodeProps<"separateAudioTrackNode">;

const SeparateAudioTrackNode = ({
    selected,
    data,
}: SeparateAudioTrackRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("separate_audio_track");
    const fileKeys = data.fileKeys;
    const expands = useFlow((s) => s.expands);

    // Filter to vocal stems only on task completion.
    const handleTaskUpdate = useCallback(
        (task: Task) => {
            if (task?.status === "COMPLETED") {
                const audioKeys = task?.data?.uploadedFiles as string[];
                if (audioKeys && audioKeys.length > 0) {
                    const vocals = audioKeys.filter((fileKey) =>
                        fileKey.includes("_vocals"),
                    );
                    if (vocals.length > 0) {
                        expands("", [
                            { type: "audioNode", data: { fileKeys: vocals } },
                        ]);
                    }
                }
                return true;
            }
            return false;
        },
        [expands],
    );

    return (
        <AbiNodeShell
            feature="separate_audio_track"
            sourceSpec={{ audio: batchOn() }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.separateTrack")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.extractVocals")}
            executeDisabled={!fileKeys?.length}
            onTaskUpdate={handleTaskUpdate}
        />
    );
};

export default memo(SeparateAudioTrackNode);
