import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { RfDataNodeProps } from "@/types/nodes";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

type DenoiseAudioRfProps = RfDataNodeProps<"denoiseAudioSubtitleNode">;

const DEFAULT_FEATURE = "denoise_audio";

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

const DenoiseAudioNode = ({ selected, data }: DenoiseAudioRfProps) => {
    const t = useTranslations("Workspace.nodes");
    // fileKeys from data are used to determine whether the button is clickable (UI display)
    const fileKeys = data.fileKeys;

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
                title: t("titles.denoiseAudio"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.startDenoise"),
                executeDisabled: !fileKeys?.length,
                // Fetch data from upstream nodes at execution time
                getPrompts: (ctx?: GetPromptsContext) => {
                    // Prefer the latest data from upstream nodes; use local data if there is no upstream connection
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "audioNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return (
                        keys?.map((fileKey: string) => ({
                            fileKey: fileKey,
                        })) || []
                    );
                },
            }}
        />
    );
};

export default memo(DenoiseAudioNode);
