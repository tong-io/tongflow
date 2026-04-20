import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Video as VideoIcon } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { getR2Url } from "@/lib/r2-utils";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import useFlow from "@/hooks/use-flow";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { multiModelSelectOptions } from "@/utils/node-model-select-label";

interface VideoGenTextSpeechRecognizeNodeProps extends NodeProps {
    data: {
        fileKeys?: string[];
    };
}

const ASR_FEATURES = ["transcribe", "transcribe_timestamp"] as const;

// 工作流执行配置（基础配置，不包含动态的feature）
const baseWorkflowConfig = {
    label: "语音识别",
    outputType: "textNode",
    outputField: "texts" as const,
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

const VideoGenTextSpeechRecognizeNode = ({
    selected,
    data,
}: VideoGenTextSpeechRecognizeNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const { fileKeys = [] } = data;

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        ASR_FEATURES,
        "transcribe",
    );

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...baseWorkflowConfig,
                feature: featureName,
                title: t("titles.speechRecognize"),
                icon: <VideoIcon className="h-5 w-5" />,
                executeLabel: t("actions.describeVideo"),
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
                        video: getR2Url(fileKey),
                    }));
                },
            }}
        >
            <div className="p-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(value) =>
                        updates(id, { ...data, feature: value })
                    }
                    options={multiModelSelectOptions(
                        [...ASR_FEATURES],
                        (k) => t(k as Parameters<typeof t>[0]),
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

VideoGenTextSpeechRecognizeNode.displayName = "VideoGenTextSpeechRecognizeNode";

export default memo(VideoGenTextSpeechRecognizeNode);
