import { useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { Atom } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useNodeState } from "@/hooks/use-node-data";
import useFlow from "@/hooks/use-flow";
import { NodeTextarea } from "../base/node-textarea";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "drop_video";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        fileKeys: {
            sources: [upstreamParam("videoNode", "fileKeys")],
            required: true,
        },
        query: {
            sources: [configParam("query")],
        },
    },
};

const DropVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes.batch");
    const tNodes = useTranslations("Workspace.nodes");
    const { fileKeys } = data as { fileKeys: string[] };
    const expands = useFlow((s) => s.expands);

    const id = useNodeId()!;

    // Use the new hook to manage state persistence
    const [state, setState] = useNodeState(
        {
            query: "",
        },
        data,
    );
    const { query } = state;

    // Handle task updates (filtering returns an array with keep markers)
    const handleTaskUpdate = useCallback(
        (task: any): boolean => {
            if (task?.status === "COMPLETED") {
                const filteredData = (task.data as unknown as any[]) || [];
                const videoFileKeys = filteredData
                    .filter((item) => item?.keep)
                    .map((item) => item.fileKey);
                if (videoFileKeys.length > 0 && id) {
                    expands(id, [
                        {
                            type: "videoNode",
                            data: { fileKeys: videoFileKeys },
                        },
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
                title: t("videoFilter"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("startFilter"),
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
                        ? [
                              {
                                  fileKeys: finalKeys,
                                  query,
                              },
                          ]
                        : [];
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    cardClassName="p-5"
                    rows={6}
                    placeholder={t("describeRequirements")}
                    value={query}
                    onChange={(value) => setState({ query: value })}
                />
            </div>
        </BaseNode>
    );
};

export default memo(DropVideoNode);
