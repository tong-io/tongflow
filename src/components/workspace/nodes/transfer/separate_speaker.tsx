import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { Card } from "@/components/ui/card";
import { Atom } from "lucide-react";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

// 工作流执行配置
const workflowConfig = {
    feature: "separate_speaker",
    label: "说话人分离",
    outputType: "audioNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "audio",
    paramMappings: {
        audio: {
            sources: [
                upstreamParam("audioNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
    },
};

const SeparateSpeakerNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys } = data as { fileKeys: string[] };
    const expands = useFlow((s) => s.expands);

    // 自定义任务更新处理 - 需要循环展开每个文件
    const handleTaskUpdate = useCallback(
        (task: any) => {
            if (task?.status === "COMPLETED") {
                const outputKeys = task?.data?.outputKeys as string[];
                if (outputKeys && outputKeys.length > 0) {
                    outputKeys.forEach((fileKey) =>
                        expands("", [
                            {
                                type: "audioNode",
                                data: { fileKeys: [fileKey] },
                            },
                        ]),
                    );
                }
                return true; // 已处理，跳过默认逻辑
            }
            return false;
        },
        [expands],
    );

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.separateSpeaker"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.startSeparation"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "audioNode",
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
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <Card className="p-5 space-y-4"></Card>
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

export default memo(SeparateSpeakerNode);
