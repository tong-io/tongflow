import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { RfDataNodeProps } from "@/types/nodes";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

type RemoveVideoSubtitleRfProps = RfDataNodeProps<"removeVideoSubtitleNode">;

const DEFAULT_FEATURE = "subtitle_remove";

const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "video",
    paramMappings: {
        video: {
            sources: [upstreamParam("videoNode", "fileKeys")],
            required: true,
        },
    },
};

const RemoveVideoSubtitleNode = ({
    selected,
    data,
}: RemoveVideoSubtitleRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys;

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
