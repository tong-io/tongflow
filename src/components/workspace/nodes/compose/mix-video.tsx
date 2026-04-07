import { Handle, Position, useNodesData, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import { Atom } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

// 工作流执行配置
const workflowConfig = {
    feature: "wan22-i2v-allinone-repid", // 可由 data.feature 覆盖
    label: "人物替换",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    paramMappings: {
        image: {
            sources: [upstreamParam("imageNode", "fileKeys")],
            required: true,
        },
        video: {
            sources: [upstreamParam("videoNode", "fileKeys")],
            required: true,
        },
        duration: {
            sources: [configParam("duration", 25)],
        },
    },
};

const MixVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { ids, feature } = data as { ids: string[]; feature: string };
    const fromNodes = useNodesData(ids);
    const images = fromNodes.find((node) => node.type === "imageNode")?.data
        ?.fileKeys as string[];
    const videos = fromNodes.find((node) => node.type === "videoNode")?.data
        ?.fileKeys as string[];

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
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.mixVideo"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.startReplace"),
                executeDisabled: !images || !videos,
                getPrompts: () =>
                    images && videos
                        ? videos.map((video, index) => ({
                              image: images[index],
                              video: video,
                              duration: 25,
                          }))
                        : [],
            }}
        >
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

export default memo(MixVideoNode);
