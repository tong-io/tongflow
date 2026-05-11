import { useNodeId } from "@xyflow/react";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback } from "react";
import useFlow from "@/hooks/use-flow";
import type { RfDataNodeProps } from "@/types/nodes";
import {
    configParam,
    type GetPromptsContext,
    staticParam,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

type SeparateAudioTrackRfProps = RfDataNodeProps<"separateAudioTrackNode">;

const DEFAULT_FEATURE = "separate_audio_track";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "audioNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "audio",
    paramMappings: {
        audio: {
            sources: [
                upstreamParam("audioNode", "fileKeys[0]"),
            ],
            required: true,
        },
        track: {
            sources: [configParam("selectedTrack"), staticParam("vocals")],
        },
    },
};

const SeparateAudioTrackNode = ({
    selected,
    data,
}: SeparateAudioTrackRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const _updates = useFlow((s) => s.updates);
    const _id = useNodeId()!;
    const fileKeys = data.fileKeys;
    const expands = useFlow((s) => s.expands);

    // Custom task updater — filters auxiliary vocal stems only
    const handleTaskUpdate = useCallback(
        (task: any) => {
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
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
                title: t("titles.separateTrack"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.extractVocals"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "audioNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return (
                        keys?.map((fileKey) => ({
                            audio: fileKey,
                        })) || []
                    );
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        />
    );
};

export default memo(SeparateAudioTrackNode);
