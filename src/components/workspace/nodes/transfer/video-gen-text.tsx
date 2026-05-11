import { MessageSquare, Video as VideoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import { useNodeState } from "@/hooks/use-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    configParam,
    type GetPromptsContext,
    staticParam,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";
import { NodeTextarea } from "../base/node-textarea";

const DEFAULT_FEATURE = "video-gen-text";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "video",
    paramMappings: {
        video: {
            sources: [
                upstreamParam("videoNode", "fileKeys[0]"),
            ],
            required: true,
        },
        text: {
            sources: [configParam("query"), staticParam("")],
        },
    },
};

const VideoGenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"video-gen-text", "videoGenTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys ?? [];

    const [state, setState] = useNodeState({ customPrompt: "" }, data);
    const { customPrompt } = state;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
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
                        video: fileKey,
                        ...(customPrompt ? { text: customPrompt } : {}),
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    label={t("videoGenText.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("videoGenText.promptPlaceholder")}
                    value={customPrompt}
                    onChange={(value) => setState({ customPrompt: value })}
                    rows={3}
                />
            </div>
        </BaseNode>
    );
};

VideoGenTextNode.displayName = "VideoGenTextNode";

export default memo(VideoGenTextNode);
