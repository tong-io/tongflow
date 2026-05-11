import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

const DEFAULT_FEATURE = "separate-video-audio";

const workflowConfig = {
    feature: DEFAULT_FEATURE,
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

const SeparateVideoAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "separate-video-audio",
    "separateVideoAudioNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys;

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
                title: t("titles.splitVideoAudio"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.splitVideoAudio"),
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

export default memo(SeparateVideoAudioNode);
