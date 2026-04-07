import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { memo, useCallback, useMemo } from "react";
import { Scissors } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import useFlow from "@/hooks/use-flow";
import { useNodeTaskUpdate } from "@/hooks/use-task";
import { useNodeState } from "@/hooks/use-node-data";
import { NodeTextarea } from "../base/node-textarea";
import { useTranslations } from "next-intl";

// 工作流执行配置
const workflowConfig = {
    feature: "split_text",
    label: "Split Text",
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

const SplitTextNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");
    const { ids = [], texts: localTexts = [] } = data as {
        ids?: string[];
        texts?: string[];
    };

    const expands = useFlow((s) => s.expands);
    const id = useNodeId()!;

    // 从上游节点获取文本
    const fromNodes = useNodesData(ids);
    const textNodes = fromNodes.filter((node) => node.type === "textNode");

    const texts: string[] = useMemo(() => {
        if (textNodes.length > 0) {
            return (textNodes[0].data as any)?.texts || [];
        }
        return localTexts;
    }, [textNodes, localTexts]);

    // 用户输入的拆分提示词（可选）
    const [state, setState] = useNodeState({ userPrompt: "" }, data);
    const { userPrompt } = state;

    // 处理任务更新（拆分返回 texts 数组）
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

    // 订阅任务更新
    useNodeTaskUpdate(id || "", handleTaskUpdate);

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
            <div className="p-4 space-y-2">
                <NodeTextarea
                    rows={3}
                    placeholder={t("common.enterInstructions")}
                    value={userPrompt}
                    onChange={(value) => setState({ userPrompt: value })}
                    className="min-h-[80px]"
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

export default memo(SplitTextNode);
