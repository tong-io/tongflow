import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
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
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";
import { useNodeTaskUpdate } from "@/hooks/use-task";
import { NodeTextarea } from "../base/node-textarea";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "drop_video";

// 工作流执行配置
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "视频筛选",
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
    const updates = useFlow((s) => s.updates);

    const id = useNodeId()!;

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        [DEFAULT_FEATURE],
        DEFAULT_FEATURE,
    );

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            query: "",
        },
        data,
    );
    const { query } = state;

    // 处理任务更新（筛选返回带 keep 标记的数组）
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

    // 通过 useNodeTaskUpdate 订阅该节点的任务更新
    useNodeTaskUpdate(id || "", handleTaskUpdate);

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: featureName,
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
                        ? [{ fileKeys: finalKeys, query }]
                        : [];
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <div className="p-4 space-y-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(value) =>
                        updates(id, { ...data, feature: value })
                    }
                    options={singleModelSelectOptions(DEFAULT_FEATURE, (k) =>
                        tNodes(k as Parameters<typeof tNodes>[0]),
                    )}
                />
                <NodeTextarea
                    cardClassName="p-5"
                    rows={6}
                    placeholder={t("describeRequirements")}
                    value={query}
                    onChange={(value) => setState({ query: value })}
                />
            </div>
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

export default memo(DropVideoNode);
