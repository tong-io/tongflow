import {
    useNodeId,
    useNodesData,
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
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import {
    useNodePluginIds,
    usePluginsRegistry,
    usePluginsRegistryStore,
} from "@/hooks/use-plugins-registry";
import { pluginDisplayName } from "../base/node-plugin-id-select";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

const GEN_TEXT_FEATURES = ["gen-text"] as const;

// Reasoning box component
const ReasoningBox = ({ content }: { content: string }) => {
    const tBase = useTranslations("Workspace.nodes.base");
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
                        {tBase("thinkingProcess")}
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
    feature: "gen-text",
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "text",
    abiProducerPropertyCandidates: ["text", "result", "texts"] as const,
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

const GenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"gen-text", "genTextNode">) => {
    const { ids = [], texts: localTexts = [] } = data;

    const expands = useFlow((s) => s.expands);
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    // Ensure plugins registry is loaded (drives model/provider options).
    usePluginsRegistry();

    // If ids are present, get data from associated nodes (composition mode)
    // In composition mode, there may be multiple textNodes: one for input text and one for the prompt
    const fromNodes = useNodesData(ids);
    const textNodes = fromNodes.filter((node) => node.type === "textNode");

    // Get text data from the composite node
    // Use the first textNode as input text and the second one, if present, as the prompt
    const texts: string[] = useMemo(() => {
        if (textNodes.length > 0) {
            return (textNodes[0].data as any)?.texts || [];
        }
        return localTexts;
    }, [textNodes, localTexts]);

    // If there is a second textNode, use it as the upstream prompt
    const upstreamPrompt: string = useMemo(() => {
        if (textNodes.length > 1) {
            const prompts = (textNodes[1].data as any)?.texts || [];
            return prompts[0] || "";
        }
        return "";
    }, [textNodes]);

    // Determine whether there is an upstream prompt
    const hasUpstreamPrompt = !!upstreamPrompt;

    // Use the hook to manage the user-entered prompt (the LLM plugin decides whether to use geminiModel/openaiModel)
    const [state, setState] = useNodeState(
        {
            userPrompt: "",
        },
        data,
    );
    const { userPrompt } = state;
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");
    const registry = usePluginsRegistryStore((s) => s.registry);

    const nodeSlot = "gen-text";

    const pluginOptions = useNodePluginIds(nodeSlot);
    const pluginId = (data.pluginId ?? data.pluginRepo ?? "").trim();
    /** BaseNode persists registry default; this mirrors nodePluginMap[slot][0] for first paint. */
    const effectivePluginId = (pluginId || pluginOptions[0] || "").trim();
    const modelSelectOptions = useMemo(() => {
        if (!registry) {
            // Registry not loaded yet; show plugin ids as-is.
            return pluginOptions.map((pid) => ({
                value: pid,
                label: pluginDisplayName(pid),
            }));
        }
        return pluginOptions.map((pid) => {
            return { value: pid, label: pluginDisplayName(pid) };
        });
    }, [registry, pluginOptions, nodeSlot]);

    // Get the prompt that will actually be used
    const effectivePrompt = hasUpstreamPrompt ? upstreamPrompt : userPrompt;

    // Fullscreen editing modal state
    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
    const [fullscreenValue, setFullscreenValue] = useState("");

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
        <>
            <BaseNode
                selected={selected}
                className="min-w-[480px]"
                data={data}
                workflowConfig={{
                    ...workflowConfig,
                    feature: nodeSlot,
                    showPluginSelect: false,
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
                        }));
                    },
                    onTaskUpdate: handleTaskUpdate,
                }}
                overlay={
                    showReasoningBox ? (
                        <div className="w-full h-full pointer-events-auto">
                            <ReasoningBox content={reasoningContent} />
                        </div>
                    ) : null
                }
            >
                <div className="p-4 space-y-4">
                    {pluginOptions.length > 0 && (
                        <NodeModelSelect
                            value={effectivePluginId}
                            onValueChange={(value) => {
                                const next = clampToAllowedModel(
                                    value,
                                    modelSelectOptions.map((o) => o.value),
                                    effectivePluginId,
                                );
                                updates(id, { ...(data as any), pluginId: next });
                            }}
                            options={modelSelectOptions}
                        />
                    )}
                    <div className="space-y-2">
                        {/* If there is an upstream prompt, show a preview */}
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
                </div>
            </BaseNode>

            {/* Fullscreen editing dialog */}
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
