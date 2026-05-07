import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { memo } from "react";
import { Atom } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "split-video";

// Workflow execution config
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
        threshold: {
            sources: [configParam("threshold")],
        },
    },
};

const SplitVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"split-video", "splitVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys;

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.splitVideo"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("compose.startSlice"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "videoNode",
                        "fileKeys",
                    );
                    const finalKeys = upstreamKeys?.length
                        ? upstreamKeys
                        : fileKeys;
                    return finalKeys?.length
                        ? finalKeys.map((fileKey) => ({
                              fileKey,
                              threshold: 20.0,
                          }))
                        : [];
                },
            }}
        >
        </BaseNode>
    );
};

export default memo(SplitVideoNode);
