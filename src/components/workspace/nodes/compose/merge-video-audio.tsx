import { useNodesData } from "@xyflow/react";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { upstreamParam } from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

const DEFAULT_FEATURE = "merge-video-audio";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    paramMappings: {
        video: {
            sources: [upstreamParam("videoNode", "fileKeys")],
            required: true,
        },
        audio: {
            sources: [upstreamParam("audioNode", "fileKeys")],
            required: true,
        },
    },
};

const MergeVideoAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"merge-video-audio", "mergeVideoAudioNode">) => {
    const t = useTranslations("Workspace.nodes");
    const ids = data.ids ?? [];
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
                              video: video,
                              audio: audios[index],
                          }))
                        : [],
            }}
        ></BaseNode>
    );
};

export default memo(MergeVideoAudioNode);
