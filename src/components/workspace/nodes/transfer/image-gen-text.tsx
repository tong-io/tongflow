import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Image as ImageIcon, MessageSquare } from "lucide-react";

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
    feature: "image_gen_text",
    label: "反推描述",
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "image",
    paramMappings: {
        image: {
            sources: [
                upstreamParam("imageNode", "fileKeys[0]", {
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

const ImageGenTextNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys = [] } = data as { fileKeys?: string[] };

    const [state, setState] = useNodeState({ query: "" }, data);
    const { query } = state;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.imageGenText"),
                icon: <ImageIcon className="h-5 w-5" />,
                executeLabel: t("actions.describeImage"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return keys.map((fileKey) => ({
                        image: getR2Url(fileKey),
                        ...(query?.trim()
                            ? { text: query.trim() }
                            : {}),
                    }));
                },
            }}
        >
            <div className="p-4">
                <NodeTextarea
                    label={t("imageGenText.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("imageGenText.promptPlaceholder")}
                    value={query}
                    onChange={(value) => setState({ query: value })}
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

ImageGenTextNode.displayName = "ImageGenTextNode";

export default memo(ImageGenTextNode);
