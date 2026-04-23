import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
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
import {
    DEFAULT_GEMINI_TEXT_MODEL,
    GEMINI_TEXT_MODEL_OPTIONS,
} from "@/constants/gemini-text-models";
import {
    DEFAULT_OPENAI_TEXT_MODEL,
    OPENAI_TEXT_MODEL_OPTIONS,
} from "@/constants/openai-text-models";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { registryModelOptionLabel } from "@/utils/node-model-select-label";
import { NodeModelSelect } from "../base/node-model-select";
import { NodePluginSelect } from "../base/node-plugin-select";
import { useNodePluginIds } from "@/hooks/use-plugins-registry";

const COMBINE_TEXT_FEATURES = ["combine_text"] as const;

// 思考框组件
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

// 工作流执行配置
const workflowConfig = {
    feature: "combine_text",
    label: "Combine Text",
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

const TextsGenTextNode = ({ selected, data }: NodeProps) => {
    const { ids = [], texts: localTexts = [] } = data as {
        ids?: string[];
        texts?: string[];
        pluginId?: string;
        /** @deprecated */ pluginRepo?: string;
    };

    const expands = useFlow((s) => s.expands);
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;

    // 从所有上游 textNode 收集文本（合并模式）
    const fromNodes = useNodesData(ids);
    const textNodes = fromNodes.filter((node) => node.type === "textNode");

    // 收集所有上游 textNode 的文本
    const texts: string[] = useMemo(() => {
        if (textNodes.length > 0) {
            return textNodes.flatMap((node) => (node.data as any)?.texts || []);
        }
        return localTexts;
    }, [textNodes, localTexts]);

    // 使用 Hook 管理用户输入的提示词
    const [state, setState] = useNodeState(
        {
            userPrompt: "",
            model: "auto",
            geminiModel: DEFAULT_GEMINI_TEXT_MODEL,
            openaiModel: DEFAULT_OPENAI_TEXT_MODEL,
        },
        data,
    );
    const { userPrompt, model, geminiModel, openaiModel } = state;
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");

    const MODEL_OPTIONS = [{ value: "auto", label: t("params.modelDefault") }];

    const resolvedFeatureFromModel =
        model === "auto" ? "combine_text" : `combine_text_${model}`;
    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        COMBINE_TEXT_FEATURES,
        resolvedFeatureFromModel,
    );

    const usesGeminiCombineBackend = true;
    const usesOpenAiCombineBackend = false;

    const pluginOptions = useNodePluginIds("combine_text");
    const pluginId = (
        (data as any).pluginId ?? (data as any).pluginRepo ?? ""
    ).trim();
    useEffect(() => {
        if (!pluginId) {
            updates(id, { ...(data as any), pluginId: "tongflow-llm-gemini" });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // 流式输出状态
    const [reasoningContent, setReasoningContent] = useState<string>("");
    const [showReasoningBox, setShowReasoningBox] = useState(false);
    const [_answerContent, setAnswerContent] = useState<string>("");
    const answerNodeIdRef = useRef<string | null>(null);

    // 自定义任务更新处理（流式输出）
    const handleTaskUpdate = useCallback(
        (task: any): boolean => {
            // 处理任务完成/失败 - 重置状态
            if (task?.status === "COMPLETED" || task?.status === "FAILED") {
                setTimeout(() => {
                    setReasoningContent("");
                    setAnswerContent("");
                    setShowReasoningBox(false);
                    answerNodeIdRef.current = null;
                }, 500);
                // 返回 true 表示已处理，不需要默认的节点创建逻辑
                return true;
            }

            // 检查流式数据
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

                        // 创建或更新输出节点
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
                feature: featureName,
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
                            ...(pluginId
                                ? { pluginId, nodeSlot: "combine_text" }
                                : {}),
                            ...(usesGeminiCombineBackend
                                ? { geminiModel }
                                : {}),
                            ...(usesOpenAiCombineBackend
                                ? { openaiModel }
                                : {}),
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
                {pluginOptions.length > 0 && (
                    <NodePluginSelect
                        value={pluginId}
                        onValueChange={(value) =>
                            updates(id, { ...(data as any), pluginId: value })
                        }
                        options={pluginOptions.map((r) => ({
                            value: r,
                            label: r,
                        }))}
                    />
                )}
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(v) => {
                        updates(id, { ...data, feature: v });
                        if (v === "combine_text") setState({ model: "auto" });
                    }}
                    options={MODEL_OPTIONS.map((opt) => {
                        const value = "combine_text";
                        return {
                            value,
                            label: registryModelOptionLabel(value),
                        };
                    })}
                />
                {usesGeminiCombineBackend ? (
                    <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground shrink-0 w-20">
                            {t("params.geminiModel")}
                        </Label>
                        <Select
                            value={geminiModel}
                            onValueChange={(v) =>
                                setState({ geminiModel: v })
                            }
                        >
                            <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[min(280px,50vh)]">
                                {GEMINI_TEXT_MODEL_OPTIONS.map((opt) => (
                                    <SelectItem
                                        key={opt.value}
                                        value={opt.value}
                                        className="text-xs"
                                    >
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}
                {usesOpenAiCombineBackend ? (
                    <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground shrink-0 w-20">
                            {t("params.openaiModel")}
                        </Label>
                        <Select
                            value={openaiModel}
                            onValueChange={(v) =>
                                setState({ openaiModel: v })
                            }
                        >
                            <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[min(280px,50vh)]">
                                {OPENAI_TEXT_MODEL_OPTIONS.map((opt) => (
                                    <SelectItem
                                        key={opt.value}
                                        value={opt.value}
                                        className="text-xs"
                                    >
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}
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

TextsGenTextNode.displayName = "TextsGenTextNode";

export default memo(TextsGenTextNode);
