import { Image as ImageIcon, MessageSquare } from "lucide-react";
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

const DEFAULT_FEATURE = "image-gen-text";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "image",
    paramMappings: {
        image: {
            sources: [upstreamParam("imageNode", "fileKeys[0]")],
            required: true,
        },
        text: {
            sources: [configParam("query"), staticParam("")],
        },
    },
};

const ImageGenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-gen-text", "imageGenTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys ?? [];

    const [state, setState] = useNodeState({ query: "" }, data);
    const { query } = state;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
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
                    const text = query?.trim() ?? "";
                    return keys.map((fileKey) => ({
                        image: fileKey,
                        text,
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    label={t("imageGenText.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("imageGenText.promptPlaceholder")}
                    value={query}
                    onChange={(value) => setState({ query: value })}
                    rows={3}
                />
            </div>
        </BaseNode>
    );
};

ImageGenTextNode.displayName = "ImageGenTextNode";

export default memo(ImageGenTextNode);
