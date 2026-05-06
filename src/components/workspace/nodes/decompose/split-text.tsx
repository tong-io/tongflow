import {
    useNodeId,
    useNodesData,
} from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { memo, useCallback, useMemo } from "react";
import { Scissors } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import useFlow from "@/hooks/use-flow";
import { useNodeState } from "@/hooks/use-node-data";
import { NodeTextarea } from "../base/node-textarea";
import { useTranslations } from "next-intl";
import { coerceBaseNodeData } from "@/utils/flow-node-data";

const DEFAULT_FEATURE = "split-text";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: false,
    paramMappings: {
        text: {
            sources: [
                upstreamParam("textNode", "texts[0]"),
                configParam("texts[0]"),
            ],
            required: true,
        },
        userPrompt: {
            sources: [configParam("userPrompt")],
        },
    },
};

const SplitTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"split-text", "splitTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");
    const ids = data.ids ?? [];
    const localTexts = data.texts ?? [];

    const expands = useFlow((s) => s.expands);
    const id = useNodeId()!;

    // Pull prompts from predecessors
    const fromNodes = useNodesData(ids);
    const textNodes = fromNodes.filter((node) => node.type === "textNode");

    const texts: string[] = useMemo(() => {
        if (textNodes.length > 0) {
            return coerceBaseNodeData(textNodes[0].data).texts || [];
        }
        return localTexts;
    }, [textNodes, localTexts]);

    // Optional split instructions from user land
    const [state, setState] = useNodeState({ userPrompt: "" }, data);
    const { userPrompt } = state;

    // Handle splitter tasks returning text arrays
    const handleTaskUpdate = useCallback(
        (task: any): boolean => {
            if (task?.status === "COMPLETED") {
                const taskData = task?.data as any;
                const splitTexts: string[] = taskData?.texts || [];

                if (splitTexts.length > 0 && id) {
                    expands(
                        id,
                        splitTexts.map((text) => ({
                            type: "textNode",
                            data: { texts: [text] },
                        })),
                    );
                }
                return true;
            }
            return false;
        },
        [id, expands],
    );

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.splitText"),
                icon: <Scissors className="h-5 w-5" />,
                executeLabel: tBase("execute"),
                executeDisabled: !texts?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const inputTexts =
                        upstreamTexts && upstreamTexts.length > 0
                            ? upstreamTexts
                            : texts;
                    return inputTexts?.length
                        ? [
                              {
                                  text: inputTexts.join("\n"),
                                  userPrompt,
                              },
                          ]
                        : [];
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    rows={3}
                    placeholder={t("common.enterInstructions")}
                    value={userPrompt}
                    onChange={(value) => setState({ userPrompt: value })}
                    className="min-h-[80px]"
                />
            </div>
        </BaseNode>
    );
};

export default memo(SplitTextNode);
