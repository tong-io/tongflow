import { Music as AudioIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import { getFileUrl } from "@/lib/file-url";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

// Workflow execution config (static shape only; omit dynamic features)
const baseWorkflowConfig = {
    feature: "transcribe",
    outputType: "textNode",
    outputField: "texts" as const,
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

const AudioGenTextSpeechRecognizeNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "transcribe",
    "audioGenTextSpeechRecognizeNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys = [] } = data;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...baseWorkflowConfig,
                title: t("titles.speechRecognize"),
                icon: <AudioIcon className="h-5 w-5" />,
                executeLabel: t("actions.recognizeSpeech"),
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
                    return keys.map((fileKey) => ({
                        audio: getFileUrl(fileKey),
                    }));
                },
            }}
        />
    );
};

AudioGenTextSpeechRecognizeNode.displayName = "AudioGenTextSpeechRecognizeNode";

export default memo(AudioGenTextSpeechRecognizeNode);
