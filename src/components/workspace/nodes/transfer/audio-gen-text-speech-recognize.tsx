import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Music as AudioIcon } from "lucide-react";

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
import { NodePluginSelect } from "../base/node-plugin-select";
import { useNodePluginIdsUnion } from "@/hooks/use-plugins-registry";
import { NODE_TRANSCRIBE_SLOTS } from "@/lib/tongflow-abi";

interface AudioGenTextSpeechRecognizeNodeProps extends NodeProps {
    data: {
        fileKeys?: string[];
        /** Directory name under `plugins/` (from registry). */
        pluginId?: string;
        /** @deprecated */ pluginRepo?: string;
    };
}

const ASR_FEATURES = ["transcribe", "transcribe_timestamp"] as const;

// 工作流执行配置（基础配置，不包含动态的feature）
const baseWorkflowConfig = {
    label: "语音识别",
    outputType: "textNode",
    outputField: "texts" as const,
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

const AudioGenTextSpeechRecognizeNode = ({
    selected,
    data,
}: AudioGenTextSpeechRecognizeNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const { fileKeys = [] } = data;
    const pluginOptions = useNodePluginIdsUnion([...NODE_TRANSCRIBE_SLOTS]);
    const pluginId = (
        data.pluginId ??
        (data as { pluginRepo?: string }).pluginRepo ??
        ""
    ).trim();

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
                icon: <AudioIcon className="h-5 w-5" />,
                executeLabel: t("actions.recognizeSpeech"),
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
                    return keys.map((fileKey) => ({
                        audio: getR2Url(fileKey),
                        ...(pluginId
                            ? {
                                  pluginId,
                                  nodeSlot: featureName,
                              }
                            : {}),
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                {pluginOptions.length > 0 && (
                    <NodePluginSelect
                        value={pluginId}
                        onValueChange={(value) =>
                            updates(id, { ...data, pluginId: value })
                        }
                        options={pluginOptions.map((r) => ({
                            value: r,
                            label: r,
                        }))}
                    />
                )}
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

AudioGenTextSpeechRecognizeNode.displayName = "AudioGenTextSpeechRecognizeNode";

export default memo(AudioGenTextSpeechRecognizeNode);
