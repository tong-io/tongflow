import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { Atom } from "lucide-react";
import {
    upstreamParam,
    configParam,
    staticParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";

const DEFAULT_FEATURE = "separate_audio_track";

// 工作流执行配置
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "人声提取",
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
        track: {
            sources: [configParam("selectedTrack"), staticParam("vocals")],
        },
    },
};

const SeparateAudioTrackNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const { fileKeys } = data as { fileKeys: string[] };
    const expands = useFlow((s) => s.expands);

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        [DEFAULT_FEATURE],
        DEFAULT_FEATURE,
    );

    // 自定义任务更新处理 - 需要过滤 vocals 文件
    const handleTaskUpdate = useCallback(
        (task: any) => {
            if (task?.status === "COMPLETED") {
                const audioKeys = task?.data?.uploadedFiles as string[];
                if (audioKeys && audioKeys.length > 0) {
                    const vocals = audioKeys.filter((fileKey) =>
                        fileKey.includes("_vocals"),
                    );
                    if (vocals.length > 0) {
                        expands("", [
                            { type: "audioNode", data: { fileKeys: vocals } },
                        ]);
                    }
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
                feature: featureName,
                title: t("titles.separateTrack"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.extractVocals"),
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

export default memo(SeparateAudioTrackNode);
