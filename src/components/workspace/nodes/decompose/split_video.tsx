import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { Atom } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import useFlow from "@/hooks/use-flow";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";
import { useNodeTaskUpdate } from "@/hooks/use-task";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "split_video";

// 工作流执行配置
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "视频切片",
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
    const updates = useFlow((s) => s.updates);

    const id = useNodeId()!;

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        [DEFAULT_FEATURE],
        DEFAULT_FEATURE,
    );

    // 处理任务更新（切片返回 split_keys 数组）
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

    // 通过 useNodeTaskUpdate 订阅该节点的任务更新
    useNodeTaskUpdate(id || "", handleTaskUpdate);

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: featureName,
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
            <div className="p-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(value) =>
                        updates(id, { ...data, feature: value })
                    }
                    options={singleModelSelectOptions(DEFAULT_FEATURE, (k) =>
                        t(k as Parameters<typeof t>[0]),
                    )}
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

export default memo(SplitVideoNode);
