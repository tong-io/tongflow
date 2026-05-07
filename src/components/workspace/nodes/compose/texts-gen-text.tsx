import {
    useNodesData,
} from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { memo, useMemo } from "react";
import { Wand2 } from "lucide-react";

import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useNodeState } from "@/hooks/use-node-data";
import { NodeTextarea } from "../base/node-textarea";
import { useTranslations } from "next-intl";

// Workflow execution config
const workflowConfig = {
    feature: "combine-text",
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: false,
    paramMappings: {
        texts: {
            sources: [upstreamParam("textNode", "texts"), configParam("texts")],
            required: true,
        },
        userPrompt: {
            sources: [configParam("userPrompt")],
        },
    },
};

const TextsGenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"combine-text", "textsGenTextNode">) => {
    const { ids = [], texts: localTexts = [] } = data;

    // Collect text from all upstream textNodes (merge mode)
    const fromNodes = useNodesData(ids);
    const textNodes = fromNodes.filter((node) => node.type === "textNode");

    const texts: string[] = useMemo(() => {
        if (textNodes.length > 0) {
            return textNodes.flatMap((node) => (node.data as any)?.texts || []);
        }
        return localTexts;
    }, [textNodes, localTexts]);

    const [state, setState] = useNodeState(
        {
            userPrompt: "",
        },
        data,
    );
    const { userPrompt } = state;
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.combineText"),
                icon: <Wand2 className="h-5 w-5" />,
                executeLabel: tBase("execute"),
                executeDisabled: !texts?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const ctxUpstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const inputTexts =
                        ctxUpstreamTexts && ctxUpstreamTexts.length > 0
                            ? ctxUpstreamTexts
                            : texts;
                    return [
                        {
                            texts: inputTexts,
                            userPrompt,
                        },
                    ];
                },
            }}
        >
            <div className="p-4 space-y-4">
                <div className="space-y-2">
                    <NodeTextarea
                        rows={6}
                        placeholder={t("common.enterInstructions")}
                        value={userPrompt}
                        onChange={(value) => setState({ userPrompt: value })}
                        className="min-h-[120px]"
                    />
                </div>
            </div>
        </BaseNode>
    );
};

TextsGenTextNode.displayName = "TextsGenTextNode";

export default memo(TextsGenTextNode);
