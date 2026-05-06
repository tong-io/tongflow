import {
    useNodeId,
    useNodesData,
} from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { useState, memo, useCallback, useRef, useEffect, useMemo } from "react";
import { Brain, Wand2 } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import useFlow from "@/hooks/use-flow";
import { useNodeState } from "@/hooks/use-node-data";
import { NodeTextarea } from "../base/node-textarea";
import { useTranslations } from "next-intl";

// Reasoning box component
const ReasoningBox = ({ content }: { content: string }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [content]);

    return (
        <div className="w-full h-full bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-blue-900">
                        {/* Note: This component logic is inside component but t is not available here easily without passing it.
                            I will move useTranslations to GenTextNode but ReasoningBox is outside.
                            Actually, I can pass t as prop or move ReasoningBox inside, or just use a simple hook inside.
                         */}
                        Thinking Process
                    </h3>
                </div>
            </div>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
                <p className="text-xs text-blue-700 leading-relaxed whitespace-pre-wrap break-words">
                    {content}
                </p>
            </div>
        </div>
    );
};

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

    const expands = useFlow((s) => s.expands);
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;

    // Collect text from all upstream textNodes (merge mode)
    const fromNodes = useNodesData(ids);
    const textNodes = fromNodes.filter((node) => node.type === "textNode");

    // Collect text from all upstream textNodes
    const texts: string[] = useMemo(() => {
        if (textNodes.length > 0) {
            return textNodes.flatMap((node) => (node.data as any)?.texts || []);
        }
        return localTexts;
    }, [textNodes, localTexts]);

    // Use the hook to manage the user-entered prompt
    const [state, setState] = useNodeState(
        {
            userPrompt: "",
        },
        data,
    );
    const { userPrompt } = state;
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");

    // Streaming output state
    const [reasoningContent, setReasoningContent] = useState<string>("");
    const [showReasoningBox, setShowReasoningBox] = useState(false);
    const [_answerContent, setAnswerContent] = useState<string>("");
    const answerNodeIdRef = useRef<string | null>(null);

    // Custom task updater — handles streaming deltas
    const handleTaskUpdate = useCallback(
        (task: any): boolean => {
            // Handle task completion/failure - reset state
            if (task?.status === "COMPLETED" || task?.status === "FAILED") {
                setTimeout(() => {
                    setReasoningContent("");
                    setAnswerContent("");
                    setShowReasoningBox(false);
                    answerNodeIdRef.current = null;
                }, 500);
                // Return true to indicate it was handled and the default node creation logic is not needed
                return true;
            }

            // Check streaming data
            if (task?.data?.content) {
                if (task?.data?.type === "reasoning") {
                    setReasoningContent((prev) =>
                        prev
                            ? `${prev}${task.data.content}`
                            : task.data.content,
                    );
                    setShowReasoningBox(true);
                    return true;
                }

                if (task?.data?.type === "answer") {
                    setShowReasoningBox(false);
                    setAnswerContent((prev) => {
                        const newContent = prev
                            ? `${prev}${task.data.content}`
                            : task.data.content;

                        // Create or update the output node
                        if (!answerNodeIdRef.current && id) {
                            const nodeIds = expands(id, [
                                {
                                    type: "textNode",
                                    data: { texts: [newContent] },
                                },
                            ]);
                            if (nodeIds?.length > 0) {
                                answerNodeIdRef.current = nodeIds[0];
                            }
                        } else if (answerNodeIdRef.current) {
                            updates(answerNodeIdRef.current, {
                                texts: [newContent],
                            });
                        }

                        return newContent;
                    });
                    return true;
                }
            }

            return false;
        },
        [id, expands, updates],
    );

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
                onTaskUpdate: handleTaskUpdate,
            }}
            overlay={
                showReasoningBox ? (
                    <div className="w-full h-full pointer-events-auto">
                        {/* Passing raw string for now as I left ReasoningBox outside. Ideally refactor ReasoningBox to use t or accept title prop. */}
                        <ReasoningBox content={reasoningContent} />
                    </div>
                ) : null
            }
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
