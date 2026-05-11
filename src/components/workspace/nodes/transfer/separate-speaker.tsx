import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { RfDataNodeProps } from "@/types/nodes";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

type SeparateSpeakerRfProps = RfDataNodeProps<"separateSpeakerNode">;

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
                upstreamParam("audioNode", "fileKeys[0]"),
            ],
            required: true,
        },
    },
};

const SeparateSpeakerNode = ({ selected, data }: SeparateSpeakerRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys;

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
                            audio: fileKey,
                        })) || []
                    );
                },
            }}
        />
    );
};

export default memo(SeparateSpeakerNode);
