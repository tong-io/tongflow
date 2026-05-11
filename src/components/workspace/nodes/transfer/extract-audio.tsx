import { Music } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

const DEFAULT_FEATURE = "extract-audio";

const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "audioNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "video",
    paramMappings: {
        video: {
            sources: [
                upstreamParam("videoNode", "fileKeys[0]"),
            ],
            required: true,
        },
    },
};

const ExtractAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"extract-audio", "extractAudioNode">) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys;

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
                title: t("titles.extractAudioTrack"),
                icon: <Music className="h-5 w-5" />,
                executeLabel: t("actions.extractAudioTrack"),
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
                    return (
                        keys?.map((fileKey) => ({
                            video: fileKey,
                        })) || []
                    );
                },
            }}
        />
    );
};

export default memo(ExtractAudioNode);
