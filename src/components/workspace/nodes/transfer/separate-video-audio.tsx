import { useNodeId } from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { memo, useCallback } from "react";
import { BaseNode } from "../base/base-node";
import { Atom } from "lucide-react";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import useFlow from "@/hooks/use-flow";
import { normalizeTaskPayloadData } from "@/utils/task-payload";

const DEFAULT_FEATURE = "separate-video-audio";

const workflowConfig = {
    feature: DEFAULT_FEATURE,
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

const SeparateVideoAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"separate-video-audio", "separateVideoAudioNode">) => {
    const t = useTranslations("Workspace.nodes");
    const id = useNodeId()!;
    const expands = useFlow((s) => s.expands);
    const fileKeys = data.fileKeys;

    const onTaskUpdate = useCallback(
        (task: any) => {
            if (task?.status !== "COMPLETED") return false;
            const payload =
                normalizeTaskPayloadData(task?.data) ??
                (task?.data as Record<string, unknown> | undefined);
            if (!payload) return false;
            const vk = payload["video_file_key"];
            const ak = payload["audio_file_key"];
            if (typeof vk !== "string" || typeof ak !== "string") return false;
            expands(id, [
                { type: "videoNode", data: { fileKeys: [vk] } },
                { type: "audioNode", data: { fileKeys: [ak] } },
            ]);
            return true;
        },
        [expands, id],
    );

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
                title: t("titles.splitVideoAudio"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.splitVideoAudio"),
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
                    return (
                        keys?.map((fileKey) => ({
                            fileKey: fileKey,
                        })) || []
                    );
                },
                onTaskUpdate,
            }}
        />
    );
};

export default memo(SeparateVideoAudioNode);
