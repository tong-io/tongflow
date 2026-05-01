import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Video as VideoIcon } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { getFileUrl } from "@/lib/file-url";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

interface VideoGenTextSpeechRecognizeNodeProps extends NodeProps {
    data: {
        fileKeys?: string[];
        pluginId?: string;
        /** @deprecated */ pluginRepo?: string;
    };
}

// Workflow execution config (static shape only; omit dynamic features)
const baseWorkflowConfig = {
    feature: "transcribe",
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "video",
    paramMappings: {
        video: {
            sources: [
                upstreamParam("videoNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
    },
};

const VideoGenTextSpeechRecognizeNode = ({
    selected,
    data,
}: VideoGenTextSpeechRecognizeNodeProps) => {
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
                icon: <VideoIcon className="h-5 w-5" />,
                executeLabel: t("actions.describeVideo"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "videoNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return keys.map((fileKey) => ({
                        video: getFileUrl(fileKey),
                    }));
                },
            }}
        />
    );
};

VideoGenTextSpeechRecognizeNode.displayName = "VideoGenTextSpeechRecognizeNode";

export default memo(VideoGenTextSpeechRecognizeNode);
