import { useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { Atom } from "lucide-react";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "separate_speaker";

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
                upstreamParam("audioNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
    },
};

const SeparateSpeakerNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const { fileKeys } = data as { fileKeys: string[] };
    const expands = useFlow((s) => s.expands);

    // Custom task updater — expands every auxiliary file artifact
    const handleTaskUpdate = useCallback(
        (task: any) => {
            if (task?.status === "COMPLETED") {
                const outputKeys = task?.data?.outputKeys as string[];
                if (outputKeys && outputKeys.length > 0) {
                    outputKeys.forEach((fileKey) =>
                        expands("", [
                            {
                                type: "audioNode",
                                data: { fileKeys: [fileKey] },
                            },
                        ]),
                    );
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
                title: t("titles.separateSpeaker"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.startSeparation"),
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
                            fileKey: fileKey,
                        })) || []
                    );
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        />
    );
};

export default memo(SeparateSpeakerNode);
