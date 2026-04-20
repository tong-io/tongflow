import { Handle, Position, useNodesData, useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import { Atom } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import useFlow from "@/hooks/use-flow";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";

const DEFAULT_FEATURE = "merge_video_audio";

// 工作流执行配置
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "音视频合并",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    paramMappings: {
        video_key: {
            sources: [upstreamParam("videoNode", "fileKeys")],
            required: true,
        },
        audio_key: {
            sources: [upstreamParam("audioNode", "fileKeys")],
            required: true,
        },
    },
};

const MergeVideoAudioNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const { ids } = data as { ids: string[] };
    const fromNodes = useNodesData(ids);
    const audios = fromNodes.find((node) => node.type === "audioNode")?.data
        ?.fileKeys as string[];
    const videos = fromNodes.find((node) => node.type === "videoNode")?.data
        ?.fileKeys as string[];

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        [DEFAULT_FEATURE],
        DEFAULT_FEATURE,
    );

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
                feature: featureName,
                title: t("titles.mergeVideoAudio"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.startMerge"),
                executeDisabled: !audios || !videos,
                getPrompts: () =>
                    audios && videos
                        ? videos.map((video, index) => ({
                              audio_key: audios[index],
                              video_key: video,
                          }))
                        : [],
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

export default memo(MergeVideoAudioNode);
