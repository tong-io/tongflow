import { Film } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

const DEFAULT_FEATURE = "get-last-frame";

const GetLastFrameNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"get-last-frame", "getLastFrameNode">) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys;

    const workflowConfig = {
        feature: DEFAULT_FEATURE,
        outputType: "imageNode",
        outputField: "fileKeys" as const,
        supportsBatch: true,
        batchParam: "videoKey",
        paramMappings: {
            videoKey: {
                sources: [upstreamParam("videoNode", "fileKeys")],
                required: true,
            },
        },
    };

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
                title: t("titles.getLastFrame"),
                icon: <Film className="h-5 w-5" />,
                executeLabel: t("actions.getLastFrame"),
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
                            videoKey: fileKey,
                        })) || []
                    );
                },
            }}
        />
    );
};

export default memo(GetLastFrameNode);
