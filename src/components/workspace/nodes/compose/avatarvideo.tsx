import { Handle, Position, useNodesData, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import { Atom } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useNodeState } from "@/hooks/use-node-data";
import { Card } from "@/components/ui/card";
import { NodeTextarea } from "../base/node-textarea";
import { useTranslations } from "next-intl";

// 工作流执行配置
const workflowConfig = {
    feature: "avatar_video",
    label: "数字人视频",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        text: {
            sources: [upstreamParam("textNode", "texts[0]")],
            required: true,
        },
        image: {
            sources: [upstreamParam("imageNode", "fileKeys[0]")],
            required: true,
        },
        audio: {
            sources: [upstreamParam("audioNode", "fileKeys[0]")],
            required: true,
        },
    },
};

const AvatarVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { ids, feature } = data as { ids: string[]; feature: string };
    const fromNodes = useNodesData(ids);
    const text = fromNodes.find((node) => node.type === "textNode")?.data?.text;
    const image = fromNodes.find((node) => node.type === "imageNode")?.data
        ?.fileKey;
    const audio = fromNodes.find((node) => node.type === "audioNode")?.data
        ?.fileKey;

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            query: "",
        },
        data,
    );
    const { query } = state;

    // 补充 outputType 和 outputField 用于 BaseNode 自动处理任务完成
    const dataWithOutput = useMemo(
        () => ({
            ...data,
            outputType: "videoNode",
            outputField: "fileKeys",
        }),
        [data],
    );

    return (
        <BaseNode
            selected={selected}
            data={dataWithOutput}
            workflowConfig={useMemo(
                () => ({
                    ...workflowConfig,
                    title: t("titles.avatarVideo"),
                    icon: <Atom className="h-5 w-5" />,
                    executeLabel: t("actions.generateVideo"),
                    executeDisabled: !text || !image || !audio,
                    getPrompts: () =>
                        text && image && audio
                            ? [
                                  {
                                      text: text,
                                      image: image,
                                      audio: audio,
                                      duration: String(8 * 16 + 1),
                                  },
                              ]
                            : [],
                }),
                [text, image, audio, t],
            )}
        >
            <NodeTextarea
                cardClassName="p-5"
                rows={6}
                placeholder={t("compose.describeVideo")}
                value={query}
                onChange={(value) => setState({ query: value })}
            />
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

export default memo(AvatarVideoNode);
