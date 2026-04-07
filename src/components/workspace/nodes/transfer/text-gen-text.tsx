import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { useState, memo, useCallback, useRef, useEffect, useMemo } from "react";
import { Brain, Maximize2, Wand2 } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
    feature: "gen_text",
    label: "Text Generation",
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "text",
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

const GenTextNode = ({ selected, data }: NodeProps) => {
    const { ids = [], texts: localTexts = [] } = data as {
        ids?: string[];
        texts?: string[];
    };

    const expands = useFlow((s) => s.expands);
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;

    // 如果有 ids，从关联节点获取数据（组合模式）
    // 在组合模式下，可能有多个 textNode：一个作为输入文本，一个作为提示词
    const fromNodes = useNodesData(ids);
    const textNodes = fromNodes.filter((node) => node.type === "textNode");

    // 从组合节点获取文本数据
    // 第一个 textNode 作为输入文本，第二个（如果有）作为提示词
    const texts: string[] = useMemo(() => {
        if (textNodes.length > 0) {
            return (textNodes[0].data as any)?.texts || [];
        }
        return localTexts;
    }, [textNodes, localTexts]);

    // 如果有第二个 textNode，作为上游提示词
    const upstreamPrompt: string = useMemo(() => {
        if (textNodes.length > 1) {
            const prompts = (textNodes[1].data as any)?.texts || [];
            return prompts[0] || "";
        }
        return "";
    }, [textNodes]);

    // 判断是否有上游提示词
    const hasUpstreamPrompt = !!upstreamPrompt;

    // 使用 Hook 管理用户输入的提示词（仅当 model === gemini 时传 geminiModel）
    const [state, setState] = useNodeState(
        {
            userPrompt: "",
            model: "auto",
            geminiModel: DEFAULT_GEMINI_TEXT_MODEL,
        },
        data,
    );
    const { userPrompt, model, geminiModel } = state;
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");

    const MODEL_OPTIONS = [
        { value: "auto", label: t("params.modelDefault") },
        { value: "openai", label: "OpenAI" },
        { value: "gemini", label: "Gemini" },
        { value: "deepseek", label: "DeepSeek" },
    ];

    const usesGeminiBackend = model === "gemini";

    // 获取实际使用的提示词
    const effectivePrompt = hasUpstreamPrompt ? upstreamPrompt : userPrompt;

    // 全屏编辑对话框状态
    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
    const [fullscreenValue, setFullscreenValue] = useState("");

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
        <>
            <BaseNode
                selected={selected}
                className="min-w-[480px]"
                data={data}
                workflowConfig={{
                    ...workflowConfig,
                    feature:
                        model === "auto" ? "gen_text" : `gen_text_${model}`,
                    title: t("titles.textGenText"),
                    icon: <Wand2 className="h-5 w-5" />,
                    headerActions: !hasUpstreamPrompt ? (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="nodrag size-6 p-1"
                            onClick={() => {
                                setFullscreenValue(userPrompt);
                                setIsFullscreenOpen(true);
                            }}
                            title={tBase("fullscreenEdit")}
                        >
                            <Maximize2 className="h-4 w-4" />
                        </Button>
                    ) : undefined,
                    executeLabel: tBase("execute"),
                    executeDisabled: !effectivePrompt.trim() || !texts?.length,
                    getPrompts: (ctx?: GetPromptsContext) => {
                        const ctxUpstreamTexts = ctx?.getAllUpstreamData(
                            "textNode",
                            "texts",
                        ) as string[] | undefined;
                        const inputTexts =
                            ctxUpstreamTexts && ctxUpstreamTexts.length > 0
                                ? ctxUpstreamTexts
                                : texts;
                        return inputTexts.map((text) => ({
                            text: `${text}\n\n${effectivePrompt}`,
                            ...(usesGeminiBackend ? { geminiModel } : {}),
                        }));
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
                        {/* 如果有上游提示词，显示预览 */}
                        {hasUpstreamPrompt ? (
                            <Card className="p-3 bg-muted/50">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-muted-foreground">
                                        {t("textGenText.instructions")}
                                        {t("imageEdit.fromUpstream")}
                                    </Label>
                                    <div className="text-sm text-foreground p-2 bg-background rounded border border-border/50 max-h-32 overflow-y-auto">
                                        {upstreamPrompt}
                                    </div>
                                </div>
                            </Card>
                        ) : (
                            <NodeTextarea
                                rows={6}
                                placeholder={t("common.enterInstructions")}
                                value={userPrompt}
                                onChange={(value) =>
                                    setState({ userPrompt: value })
                                }
                                className="min-h-[120px] max-h-[200px] overflow-y-auto"
                                enableFullscreen={false}
                            />
                        )}
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground shrink-0 w-20">
                                {t("params.model")}
                            </Label>
                            <Select
                                value={model}
                                onValueChange={(v) => setState({ model: v })}
                            >
                                <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {MODEL_OPTIONS.map((opt) => (
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
                        {usesGeminiBackend ? (
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
                                        {GEMINI_TEXT_MODEL_OPTIONS.map(
                                            (opt) => (
                                                <SelectItem
                                                    key={opt.value}
                                                    value={opt.value}
                                                    className="text-xs"
                                                >
                                                    {opt.label}
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}
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

            {/* 全屏编辑对话框 */}
            <Dialog
                open={isFullscreenOpen}
                onOpenChange={(open: boolean) => {
                    if (!open) setIsFullscreenOpen(false);
                }}
            >
                <DialogContent
                    className="w-[90vw] h-[90vh] max-w-none flex flex-col"
                    aria-describedby={undefined}
                >
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle>
                            {t("textGenText.instructions")}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 flex flex-col">
                        <Textarea
                            value={fullscreenValue}
                            onChange={(
                                e: React.ChangeEvent<HTMLTextAreaElement>,
                            ) => setFullscreenValue(e.target.value)}
                            placeholder={t("common.enterInstructions")}
                            className="resize-none h-full w-full overflow-y-auto flex-1"
                        />
                    </div>
                    <DialogFooter className="flex-shrink-0">
                        <Button
                            variant="outline"
                            onClick={() => setIsFullscreenOpen(false)}
                        >
                            {tBase("cancel")}
                        </Button>
                        <Button
                            onClick={() => {
                                setState({ userPrompt: fullscreenValue });
                                setIsFullscreenOpen(false);
                            }}
                        >
                            {tBase("confirm")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

GenTextNode.displayName = "GenTextNode";

export default memo(GenTextNode);
