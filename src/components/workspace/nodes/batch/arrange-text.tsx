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
import { useNodeTaskUpdate } from "@/hooks/use-task";
import useFlow from "@/hooks/use-flow";
import { Card } from "@/components/ui/card";
import { NodeTextarea } from "../base/node-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "arrange_group";

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
        infos: {
            sources: [upstreamParam("videoNode", "infos")],
        },
        query: {
            sources: [configParam("query")],
        },
        groupCount: {
            sources: [configParam("groupCount")],
        },
        duplicatable: {
            sources: [configParam("duplicatable")],
        },
    },
};

const ArrangeTextNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes.batch");
    const tNodes = useTranslations("Workspace.nodes");
    const { fileKeys, infos } = data as { fileKeys: string[]; infos: [] };
    const expands = useFlow((s) => s.expands);

    const id = useNodeId()!;

    // Use the new hook to manage state persistence
    const [state, setState] = useNodeState(
        {
            query: "",
            groupCount: 3,
            duplicatable: true,
        },
        data,
    );
    const { query, groupCount, duplicatable } = state;

    // Handle task updates (permutation returns multiple groups)
    const handleTaskUpdate = useCallback(
        (task: any): boolean => {
            if (task?.status === "COMPLETED") {
                const groups = task?.data?.groups as any[];
                if (groups && groups.length > 0 && id) {
                    groups.forEach((group) => {
                        expands(id, [
                            {
                                type: "videoNode",
                                data: { fileKeys: [...group] },
                            },
                        ]);
                    });
                }
                return true; // Already handled; skip the default logic
            }
            return false;
        },
        [id, expands],
    );

    // Subscribe to this node's task updates via useNodeTaskUpdate
    useNodeTaskUpdate(id || "", handleTaskUpdate);

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("arrangeGroup"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("startArrange"),
                executeDisabled: !infos?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "videoNode",
                        "fileKeys",
                    );
                    const upstreamInfos = ctx?.getUpstreamData(
                        "videoNode",
                        "infos",
                    ) as typeof infos;
                    const finalKeys = upstreamKeys?.length
                        ? upstreamKeys
                        : fileKeys;
                    const finalInfos = upstreamInfos || infos;
                    return finalInfos?.length
                        ? [
                              {
                                  fileKeys: finalKeys,
                                  infos: finalInfos,
                                  query,
                                  groupCount,
                                  duplicatable,
                              },
                          ]
                        : [];
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <Card
                className="p-5 space-y-4 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <NodeTextarea
                    showCard={false}
                    rows={6}
                    placeholder={t("describeRequirements")}
                    value={query}
                    onChange={(value) => setState({ query: value })}
                />

                {/* Group count */}
                <div className="flex items-center justify-between">
                    <Label htmlFor="groupCount">{t("groupCount")}</Label>
                    <Input
                        id="groupCount"
                        type="number"
                        min={1}
                        value={groupCount}
                        onChange={(e) =>
                            setState({ groupCount: Number(e.target.value) })
                        }
                        className="w-24"
                    />
                </div>

                {/* Whether duplicates are allowed */}
                <div className="flex items-center justify-between">
                    <Label htmlFor="duplicatable">{t("allowDuplicate")}</Label>
                    <input
                        id="duplicatable"
                        type="checkbox"
                        checked={duplicatable}
                        onChange={(e) =>
                            setState({ duplicatable: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-gray-300"
                    />
                </div>
            </Card>
        </BaseNode>
    );
};

export default memo(ArrangeTextNode);
