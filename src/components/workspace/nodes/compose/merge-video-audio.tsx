import { useNodesData, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Atom } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "merge_video_audio";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
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
    const { ids } = data as { ids: string[] };
    const fromNodes = useNodesData(ids);
    const audios = fromNodes.find((node) => node.type === "audioNode")?.data
        ?.fileKeys as string[];
    const videos = fromNodes.find((node) => node.type === "videoNode")?.data
        ?.fileKeys as string[];

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
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
        </BaseNode>
    );
};

export default memo(MergeVideoAudioNode);
