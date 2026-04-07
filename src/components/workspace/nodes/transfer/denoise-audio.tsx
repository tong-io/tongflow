import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Atom } from "lucide-react";
import { BaseNode } from "../base/base-node";
import { Card } from "@/components/ui/card";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

// 工作流执行配置
const workflowConfig = {
    feature: "denoise_audio",
    label: "音频降噪",
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

const DenoiseAudioNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    // 从 data 获取的 fileKeys 用于判断按钮是否可点击（UI 显示）
    const { fileKeys } = data as { fileKeys: string[] };

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.denoiseAudio"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.startDenoise"),
                executeDisabled: !fileKeys?.length,
                // 执行时从上游节点实时获取数据
                getPrompts: (ctx?: GetPromptsContext) => {
                    // 优先从上游节点获取最新数据，如果没有上游连接则使用本地 data
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

export default memo(DenoiseAudioNode);
