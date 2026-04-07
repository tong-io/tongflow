import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { Atom } from "lucide-react";

import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { Card } from "@/components/ui/card";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

// 工作流执行配置
const workflowConfig = {
    feature: "video2clip",
    label: "视频分割",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "video",
    paramMappings: {
        video: {
            sources: [
                upstreamParam("videoNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
    },
};

const Video2ClipNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys = [] } = data as { fileKeys?: string[] };

    const expands = useFlow((s) => s.expands);
    const id = useNodeId()!;

    // 自定义任务更新处理（视频分割有特殊输出格式）
    const handleTaskUpdate = useCallback(
        (task: any): boolean => {
            if (task?.status === "COMPLETED") {
                const result = task?.result as any;
                const splitKeys = result?.data?.split_keys as string[];
                const originalKey = result?.data?.original_key as string;

                if (splitKeys && originalKey) {
                    const validKeys = splitKeys.filter(
                        (key) => !key.endsWith(originalKey),
                    );
                    if (validKeys.length > 0 && id) {
                        expands(id, [
                            {
                                type: "videoNode",
                                data: { fileKeys: validKeys },
                            },
                        ]);
                    }
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
                title: t("titles.video2clip"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.startSplit"),
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
                    return keys.map((fileKey) => ({
                        fileKey: fileKey,
                        threshold: 20.0,
                    }));
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <Card className="p-5" />

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

export default memo(Video2ClipNode);
