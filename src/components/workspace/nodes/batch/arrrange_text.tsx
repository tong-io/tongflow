import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback, useMemo } from "react";
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

// 工作流执行配置
const workflowConfig = {
    feature: "arrange_group",
    label: "排列组合",
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
    const { fileKeys, infos } = data as { fileKeys: string[]; infos: [] };
    const expands = useFlow((s) => s.expands);

    const id = useNodeId()!;

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            query: "",
            groupCount: 3,
            duplicatable: true,
        },
        data,
    );
    const { query, groupCount, duplicatable } = state;

    // 处理任务更新（排列组合返回多个分组）
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
                return true; // 已处理，跳过默认逻辑
            }
            return false;
        },
        [id, expands],
    );

    // 通过 useNodeTaskUpdate 订阅该节点的任务更新
    useNodeTaskUpdate(id || "", handleTaskUpdate);

    // 补充 feature 用于 BaseNode
    const dataWithFeature = useMemo(
        () => ({
            ...data,
            feature: "arrange_group",
        }),
        [data],
    );

    return (
        <BaseNode
            selected={selected}
            data={dataWithFeature}
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

                {/* 分组数量 */}
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

                {/* 是否允许重复 */}
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
            <Handle
                type="target"
                position={Position.Left}
                id="a"
                isConnectable={true}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="b"
                isConnectable={true}
            />
        </BaseNode>
    );
};

export default memo(ArrangeTextNode);
