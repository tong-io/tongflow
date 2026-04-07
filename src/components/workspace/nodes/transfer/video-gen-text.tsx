import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Video as VideoIcon, MessageSquare } from "lucide-react";

import { BaseNode } from "../base/base-node";
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

// 工作流执行配置
const workflowConfig = {
    feature: "video_gen_text",
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
    const { fileKeys = [] } = data as { fileKeys?: string[] };

    const [state, setState] = useNodeState({ customPrompt: "" }, data);
    const { customPrompt } = state;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
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
            <div className="p-4">
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
