import { useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { Atom } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import useFlow from "@/hooks/use-flow";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "split_video";

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

const SplitVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys } = data as { fileKeys: string[] };
    const expands = useFlow((s) => s.expands);

    const id = useNodeId()!;

    // Handle video chunk tasks exposing split_keys
    const handleTaskUpdate = useCallback(
        (task: any): boolean => {
            if (task?.status === "COMPLETED") {
                const taskData = task?.data as any;
                const { split_keys, original_key } = taskData;
                let splitKeys: string[] = [];

                if (split_keys && original_key) {
                    const validKeys = split_keys.filter(
                        (key: string) => !key.endsWith(original_key),
                    );
                    splitKeys = validKeys;
                }

                if (splitKeys.length > 0 && id) {
                    expands(id, [
                        { type: "videoNode", data: { fileKeys: splitKeys } },
                    ]);
                }
                return true;
            }
            return false;
        },
        [id, expands],
    );

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
                onTaskUpdate: handleTaskUpdate,
            }}
        >
        </BaseNode>
    );
};

export default memo(SplitVideoNode);
