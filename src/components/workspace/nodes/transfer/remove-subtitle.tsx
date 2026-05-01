import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseNode } from "../base/base-node";
import { Atom } from "lucide-react";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "subtitle_remove";

const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "fileKey",
    paramMappings: {
        fileKey: {
            sources: [upstreamParam("videoNode", "fileKeys")],
            required: true,
        },
    },
};

const RemoveVideoSubtitleNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys } = data as { fileKeys: string[] };

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
                title: t("titles.removeSubtitle"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.removeSubtitle"),
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
                            fileKey: fileKey,
                        })) || []
                    );
                },
            }}
        />
    );
};

export default memo(RemoveVideoSubtitleNode);
