
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { memo } from "react";
import { BaseNode } from "../base/base-node";
import { Camera } from "lucide-react";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "get-first-frame";

const GetFirstFrameNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"get-first-frame", "getFirstFrameNode">) => {
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
                title: t("titles.getFirstFrame"),
                icon: <Camera className="h-5 w-5" />,
                executeLabel: t("actions.getFirstFrame"),
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

export default memo(GetFirstFrameNode);
