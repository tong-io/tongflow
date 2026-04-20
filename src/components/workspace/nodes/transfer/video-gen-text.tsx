import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Video as VideoIcon, MessageSquare } from "lucide-react";

import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { NodeTextarea } from "../base/node-textarea";
import { useNodeState } from "@/hooks/use-node-data";
import { getR2Url } from "@/lib/r2-utils";
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

const DEFAULT_FEATURE = "video_gen_text";

// 工作流执行配置
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "反推描述",
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
        text: {
            sources: [configParam("query"), staticParam("")],
        },
    },
};

const VideoGenTextNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const nodeId = useNodeId()!;
    const { fileKeys = [] } = data as { fileKeys?: string[] };

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        [DEFAULT_FEATURE],
        DEFAULT_FEATURE,
    );

    const [state, setState] = useNodeState({ customPrompt: "" }, data);
    const { customPrompt } = state;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: featureName,
                title: t("titles.videoGenText"),
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
                        ...(customPrompt ? { text: customPrompt } : {}),
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(value) =>
                        updates(nodeId, { ...data, feature: value })
                    }
                    options={singleModelSelectOptions(DEFAULT_FEATURE, (k) =>
                        t(k as Parameters<typeof t>[0]),
                    )}
                />
                <NodeTextarea
                    label={t("videoGenText.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("videoGenText.promptPlaceholder")}
                    value={customPrompt}
                    onChange={(value) => setState({ customPrompt: value })}
                    rows={3}
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

VideoGenTextNode.displayName = "VideoGenTextNode";

export default memo(VideoGenTextNode);
