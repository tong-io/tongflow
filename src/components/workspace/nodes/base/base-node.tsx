import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef, useEffect, useState, useCallback, useRef } from "react";
import {
    Loader2,
    Move,
    X,
    Wand2,
    CheckCircle,
    Circle,
} from "lucide-react";
import { useNodeId, useReactFlow, useStore, useStoreApi } from "@xyflow/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { useFeature } from "@/hooks/use-features";
import {
    useTaskStore,
    useBatchTaskManager,
    useNodeTaskUpdate,
} from "@/hooks/use-task";
import useFlow from "@/hooks/use-flow";
import type { OutputNodeType } from "@/types/nodes";
import {
    registerNodeExecutionConfig,
    type NodeExecutionConfig,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
} from "./node-header";
import { useTranslations } from "next-intl";
import { isModalNode } from "@/constants/modal-nodes";
// Platform-specific setup (download/deploy) is handled by plugin runners at execution time.

/** SSE data 有时为 JSON 字符串；Modal 可能把正文放在 markdown 或嵌套 result 里 */
function normalizeTaskPayloadData(
    data: unknown,
): Record<string, unknown> | undefined {
    if (data == null) return undefined;
    if (typeof data === "object" && !Array.isArray(data)) {
        return data as Record<string, unknown>;
    }
    if (typeof data === "string") {
        try {
            const p = JSON.parse(data) as unknown;
            if (typeof p === "object" && p !== null && !Array.isArray(p)) {
                return p as Record<string, unknown>;
            }
        } catch {
            return undefined;
        }
    }
    return undefined;
}

function pickMarkdownFromPayload(
    d: Record<string, unknown> | undefined,
): string | undefined {
    if (!d) return undefined;
    const m = d.markdown;
    if (typeof m === "string" && m.length > 0) return m;
    const res = d.result;
    if (res && typeof res === "object") {
        const rm = (res as Record<string, unknown>).markdown;
        if (typeof rm === "string" && rm.length > 0) return rm;
    }
    return undefined;
}

/* BASE NODE ---------------------------------------------------------------- */

export type BaseNodeProps = HTMLAttributes<HTMLDivElement> & {
    /**
     * Whether the node is in a selected state.
     */
    selected?: boolean;

    /**
     * An optional count value that is displayed as a badge.
     */
    count?: number;

    /**
     * 节点数据，包含 feature 和 prompt
     */
    data?: {
        feature?: string;
        prompt?: Record<string, unknown>;
        [key: string]: unknown;
    };

    /**
     * 统一的节点配置（可选）
     * 包含 Header、执行按钮、工作流执行等所有配置
     * BaseNode 渲染时会自动将其注册到全局 registry
     */
    workflowConfig?: Omit<NodeExecutionConfig, "nodeType">;

    /**
     * Any React nodes to be rendered inside the base node.
     */
    children?: ReactNode;

    /**
     * Optional overlay content that renders on top of everything (including loading state)
     */
    overlay?: ReactNode;
};

/**
 * The `<BaseNode />` component provides a consistent foundation for all nodes
 * in the workspace. It handles the visual state (selected, loading) and provides
 * a drag handle for repositioning nodes.
 *
 * This component removes animations and transitions per tongflow standards.
 */
export const BaseNode = forwardRef<HTMLDivElement, BaseNodeProps>(
    (
        {
            className,
            selected,
            count,
            data,
            workflowConfig,
            children,
            overlay,
            ...props
        },
        ref,
    ) => {
        const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
        const [isEditingComment, setIsEditingComment] =
            useState<boolean>(false);
        const [missingPluginOpen, setMissingPluginOpen] =
            useState<boolean>(false);
        const nodeId = useNodeId();
        const { updateNodeData, getNode } = useReactFlow();
        const storeApi = useStoreApi();

        // 使用 useFlow store 的 updates 方法来同步配置
        // 这比 useReactFlow().updateNodeData 更可靠，直接更新 zustand store
        const flowUpdates = useFlow((s) => s.updates);

        const comboMode = useFlow((s) => s.comboMode);
        const isInCombo = useFlow((s) =>
            nodeId ? s.isInCombo(nodeId) : false,
        );
        const toggleCombo = useFlow((s) => s.toggleCombo);

        const t = useTranslations("Workspace.nodes.base");

        // 获取节点类型（从 ReactFlow store）
        const nodeType = useStore((state) => {
            const node = state.nodeLookup.get(nodeId ?? "");
            return node?.type;
        });

        // 用于追踪是否已经同步过配置
        const hasSyncedConfigRef = useRef(false);

        // 自动注册工作流执行配置，并同步关键配置到 node.data（供后端工作流导出使用）
        useEffect(() => {
            if (workflowConfig && nodeType) {
                registerNodeExecutionConfig({
                    nodeType,
                    ...workflowConfig,
                });

                // 将工作流执行所需的配置同步到 node.data
                // 这样后端在导出工作流时可以从 node.data 读取这些配置
                // 检查是否需要同步（feature 或 paramMappings 不匹配时需要同步）
                const needsSync =
                    nodeId &&
                    workflowConfig.feature &&
                    !hasSyncedConfigRef.current &&
                    (data?.feature !== workflowConfig.feature ||
                        !data?.paramMappings);

                if (needsSync) {
                    hasSyncedConfigRef.current = true;
                    const configToSync: Record<string, unknown> = {
                        feature: workflowConfig.feature,
                    };
                    if (workflowConfig.outputType) {
                        configToSync.outputType = workflowConfig.outputType;
                    }
                    if (workflowConfig.outputField) {
                        configToSync.outputField = workflowConfig.outputField;
                    }
                    if (workflowConfig.paramMappings) {
                        configToSync.paramMappings =
                            workflowConfig.paramMappings;
                    }
                    if (workflowConfig.supportsBatch !== undefined) {
                        configToSync.supportsBatch =
                            workflowConfig.supportsBatch;
                    }
                    if (workflowConfig.batchParam) {
                        configToSync.batchParam = workflowConfig.batchParam;
                    }

                    // 使用 flowUpdates 来更新 zustand store（merge 方式）
                    flowUpdates(nodeId, { ...data, ...configToSync });
                }
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 nodeType 变化时注册，同步只执行一次
        }, [nodeType]);

        // 当 workflowConfig.feature 变化时重置同步标记（例如切换 tab）
        useEffect(() => {
            hasSyncedConfigRef.current = false;
        }, [workflowConfig?.feature]);

        // 获取工作区模式
        const workspaceMode = useTaskStore((state) => state.workspaceMode);
        const isExecuteMode = workspaceMode === "execute";

        // 获取工作流执行时的节点状态（用于显示 loading）
        const nodeExecutionStatus = useTaskStore(
            useCallback(
                (state) => state.nodeExecutionStatusMap.get(nodeId ?? ""),
                [nodeId],
            ),
        );

        // 获取 expands 方法用于创建输出节点
        const expands = useFlow((s) => s.expands);

        // 新版执行：使用统一的任务管理器
        const { isLoading: taskLoading, createBatchTasks } =
            useBatchTaskManager();

        // loading 状态：单节点任务 loading 或工作流执行时的 running 状态
        const loading = taskLoading || nodeExecutionStatus === "running";

        // 从 workflowConfig 或 data 获取 feature（workflowConfig 优先）
        const feature = workflowConfig?.feature ?? data?.feature;
        // 从 workflowConfig 或 data 获取输出配置
        const outputType = workflowConfig?.outputType ?? data?.outputType;
        const outputField = workflowConfig?.outputField ?? data?.outputField;

        const { feature: featureInfo } = useFeature(feature ?? "");
        const processingTime = featureInfo?.processingTime ?? 0;
        const featureLoading = !featureInfo && !!feature;

        // 新版执行：统一的任务更新处理
        const handleTaskUpdate = useCallback(
            (task: any) => {
                if (!nodeId || !feature) return;

                console.log(`[BaseNode] Task update for node ${nodeId}:`, task);

                // 如果提供了自定义处理函数，先调用它
                if (workflowConfig?.onTaskUpdate) {
                    const handled = workflowConfig.onTaskUpdate(task);
                    // 如果返回 true，表示已处理，不再执行默认逻辑
                    if (handled) return;
                }

                if (task?.status === "COMPLETED") {
                    // 从 workflowConfig 或 data 获取输出配置
                    const outputNodeType = outputType as
                        | OutputNodeType
                        | undefined;
                    const outputDataField = outputField as
                        | "fileKeys"
                        | "texts"
                        | undefined;

                    // 如果没有配置输出类型，跳过自动展开
                    if (!outputNodeType || !outputDataField) return;

                    const payload =
                        normalizeTaskPayloadData(task?.data) ??
                        (task?.data as Record<string, unknown> | undefined);

                    // 从任务结果中获取文件 key 或文本
                    const fileKey = payload?.file_key as string | undefined;
                    const text = payload?.text as string | undefined;
                    const texts = payload?.texts as string[] | undefined;
                    const markdown = pickMarkdownFromPayload(payload);

                    if (outputDataField === "fileKeys" && fileKey) {
                        expands(nodeId, [
                            {
                                type: outputNodeType,
                                data: { fileKeys: [fileKey] },
                            },
                        ]);
                    } else if (outputDataField === "texts") {
                        const outputTexts =
                            texts ??
                            (text
                                ? [text]
                                : typeof markdown === "string" && markdown
                                  ? [markdown]
                                  : []);
                        if (outputTexts.length > 0) {
                            expands(nodeId, [
                                {
                                    type: outputNodeType,
                                    data: { texts: outputTexts },
                                },
                            ]);
                        }
                    }
                    return;
                }

                if (task?.status === "FAILED") {
                    console.error(
                        `[BaseNode] Task failed for node ${nodeId}:`,
                        task,
                    );
                }
            },
            [
                nodeId,
                feature,
                data?.outputType,
                data?.outputField,
                workflowConfig,
                expands,
                outputType,
                outputField,
            ],
        );

        // 订阅任务更新（新版执行模式）
        useNodeTaskUpdate(nodeId ?? "", handleTaskUpdate);

        // 从嵌套路径获取数据的工具函数
        const getValueByPath = useCallback(
            (obj: Record<string, unknown>, path: string): unknown => {
                // 处理数组索引，如 "fileKeys[0]"
                const arrayMatch = path.match(/^(\w+)\[(\d+)\]$/);
                if (arrayMatch) {
                    const [, key, indexStr] = arrayMatch;
                    const arr = obj[key];
                    if (Array.isArray(arr)) {
                        return arr[parseInt(indexStr, 10)];
                    }
                    return undefined;
                }
                // 普通字段访问
                return obj[path];
            },
            [],
        );

        const edgeMatchesTargetHandle = useCallback(
            (
                edgeTarget: string | null | undefined,
                requested: string,
            ): boolean => {
                if (requested === "a") {
                    return (
                        edgeTarget === undefined ||
                        edgeTarget === null ||
                        edgeTarget === "a"
                    );
                }
                return edgeTarget === requested;
            },
            [],
        );

        // 创建上游数据获取上下文（惰性读取 store，避免订阅 nodeLookup/edges 导致拖动时重渲染）
        const getPromptsContext = useCallback((): GetPromptsContext => {
            const { nodeLookup, edges } = storeApi.getState();

            const getUpstreamData = (
                upstreamType: string,
                field: string,
            ): unknown => {
                if (!nodeId) return undefined;

                const incomingEdges = edges.filter(
                    (edge) => edge.target === nodeId,
                );

                for (const edge of incomingEdges) {
                    const sourceNode = nodeLookup.get(edge.source);
                    if (sourceNode && sourceNode.type === upstreamType) {
                        const nodeData = sourceNode.data as Record<
                            string,
                            unknown
                        >;
                        return getValueByPath(nodeData, field);
                    }
                }

                return undefined;
            };

            const getAllUpstreamData = (
                upstreamType: string,
                field: string,
            ): unknown[] => {
                if (!nodeId) return [];

                const incomingEdges = edges.filter(
                    (edge) => edge.target === nodeId,
                );

                const results: unknown[] = [];
                for (const edge of incomingEdges) {
                    const sourceNode = nodeLookup.get(edge.source);
                    if (sourceNode && sourceNode.type === upstreamType) {
                        const nodeData = sourceNode.data as Record<
                            string,
                            unknown
                        >;
                        const value = getValueByPath(nodeData, field);
                        if (value !== undefined) {
                            if (Array.isArray(value)) {
                                results.push(...value);
                            } else {
                                results.push(value);
                            }
                        }
                    }
                }

                return results;
            };

            const getUpstreamDataForTargetHandle = (
                targetHandle: string,
                upstreamType: string,
                field: string,
            ): unknown => {
                if (!nodeId) return undefined;
                for (const edge of edges) {
                    if (edge.target !== nodeId) continue;
                    if (
                        !edgeMatchesTargetHandle(
                            edge.targetHandle,
                            targetHandle,
                        )
                    )
                        continue;
                    const sourceNode = nodeLookup.get(edge.source);
                    if (sourceNode && sourceNode.type === upstreamType) {
                        const nodeData = sourceNode.data as Record<
                            string,
                            unknown
                        >;
                        return getValueByPath(nodeData, field);
                    }
                }
                return undefined;
            };

            return {
                getUpstreamData,
                getAllUpstreamData,
                getUpstreamDataForTargetHandle,
            };
        }, [nodeId, storeApi, getValueByPath, edgeMatchesTargetHandle]);

        // Legacy Modal gating removed.

        const mergePluginIdFromNodeData = useCallback(
            (prompts: Record<string, unknown>[]): Record<string, unknown>[] => {
                if (!nodeId) return prompts;
                const n = getNode(nodeId);
                const nodeData = (n?.data ?? undefined) as
                    | { pluginId?: string; pluginRepo?: string }
                    | undefined;
                const dataPluginId = (
                    typeof nodeData?.pluginId === "string"
                        ? nodeData.pluginId
                        : typeof nodeData?.pluginRepo === "string"
                          ? nodeData.pluginRepo
                          : ""
                ).trim();
                if (!dataPluginId) return prompts;
                return prompts.map((o) => {
                    if (typeof o.pluginId === "string" && o.pluginId.trim()) {
                        return o;
                    }
                    if (typeof o.pluginRepo === "string" && o.pluginRepo.trim()) {
                        return o;
                    }
                    return { ...o, pluginId: dataPluginId };
                });
            },
            [nodeId, getNode],
        );

        const performExecute = useCallback(async () => {
            console.log(
                `[BaseNode] executeNew called for node ${nodeId} , feature ${feature}, workflowConfig:`,
                workflowConfig,
            );
            if (!nodeId || !feature || !workflowConfig?.getPrompts) return;
            console.log(`[BaseNode] Executing node ${nodeId}...`);

            const context = getPromptsContext();
            const rawPrompts = workflowConfig
                .getPrompts(context)
                .map((p) => p as Record<string, unknown>);
            const prompts = mergePluginIdFromNodeData(rawPrompts);

            console.log(
                `[BaseNode] Executing node ${nodeId} with prompts:`,
                prompts,
            );
            if (prompts.length === 0) return;

            updateNodeData(nodeId, {
                feature,
                prompt: prompts.length === 1 ? prompts[0] : prompts,
                outputType,
                outputField,
            });

            try {
                const taskConfigs = prompts.map(
                    (prompt: Record<string, unknown>) => ({
                        feature,
                        prompt,
                        nodeId,
                    }),
                );

                await createBatchTasks(taskConfigs);
            } catch (error) {
                console.error(`[BaseNode] Failed to create tasks:`, error);
            }
        }, [
            nodeId,
            feature,
            outputType,
            outputField,
            workflowConfig,
            createBatchTasks,
            updateNodeData,
            getPromptsContext,
            mergePluginIdFromNodeData,
        ]);

        const executeNew = useCallback(async () => {
            if (!nodeId || !feature || !workflowConfig?.getPrompts) return;

            // Hard requirement: prompt must include pluginId (enforced server-side too).
            const context = getPromptsContext();
            const raw = workflowConfig
                .getPrompts(context)
                .map((p) => p as Record<string, unknown>);
            const merged = mergePluginIdFromNodeData(raw);
            const first = merged[0] as Record<string, unknown> | undefined;
            const pluginId =
                first && typeof first.pluginId === "string"
                    ? first.pluginId.trim()
                    : first && typeof first.pluginRepo === "string"
                      ? first.pluginRepo.trim()
                      : "";
            if (!pluginId) {
                setMissingPluginOpen(true);
                return;
            }

            await performExecute();
        }, [
            nodeId,
            feature,
            workflowConfig,
            performExecute,
            getPromptsContext,
            mergePluginIdFromNodeData,
        ]);

        // Legacy Modal deploy flow removed.

        // Get current node's comment from store
        const comment = useStore(
            useCallback(
                (state) => {
                    const node = state.nodeLookup.get(nodeId ?? "");
                    return (node?.data as { comment?: string })?.comment;
                },
                [nodeId],
            ),
        );

        const [localComment, setLocalComment] = useState<string>(comment ?? "");

        // Sync local comment when prop changes
        useEffect(() => {
            setLocalComment(comment ?? "");
        }, [comment]);

        useEffect(() => {
            if (!loading) {
                setElapsedSeconds(0);
                return;
            }

            const interval = setInterval(() => {
                setElapsedSeconds((prev) => prev + 1);
            }, 1000);

            return () => clearInterval(interval);
        }, [loading]);

        const handleCommentBlur = useCallback(() => {
            setIsEditingComment(false);
            if (nodeId && localComment !== comment) {
                updateNodeData(nodeId, { comment: localComment || undefined });
            }
        }, [nodeId, localComment, comment, updateNodeData]);

        const handleCommentKeyDown = useCallback(
            (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === "Escape") {
                    setLocalComment(comment ?? "");
                    setIsEditingComment(false);
                }
            },
            [comment],
        );

        const handleRemoveComment = useCallback(() => {
            if (nodeId) {
                updateNodeData(nodeId, { comment: undefined });
                setLocalComment("");
            }
        }, [nodeId, updateNodeData]);

        return (
            <div className="relative">
                <AlertDialog
                    open={missingPluginOpen}
                    onOpenChange={setMissingPluginOpen}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Missing Implementation
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Please select a plugin implementation in this
                                node before running.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>
                                {t("cancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction>
                                {t("confirm")}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                {/* Comment box above the node */}
                {comment !== undefined && (
                    <div
                        className={cn(
                            "absolute -top-2 left-0 right-0 -translate-y-full",
                            "nodrag",
                        )}
                    >
                        <div
                            className={cn(
                                "relative rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 mb-2",
                                "shadow-sm",
                            )}
                        >
                            {/* Remove comment button */}
                            <button
                                type="button"
                                onClick={handleRemoveComment}
                                className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                                title={t("removeComment")}
                            >
                                <X className="h-3 w-3" />
                            </button>

                            {isEditingComment ? (
                                <textarea
                                    value={localComment}
                                    onChange={(e) =>
                                        setLocalComment(e.target.value)
                                    }
                                    onBlur={handleCommentBlur}
                                    onKeyDown={handleCommentKeyDown}
                                    className="w-full min-h-[40px] resize-none rounded border-0 bg-transparent text-sm text-amber-800 dark:text-amber-200 placeholder-amber-400 dark:placeholder-amber-500 focus:outline-none focus:ring-0"
                                    placeholder={t("commentPlaceholder")}
                                    autoFocus
                                />
                            ) : (
                                <div
                                    onClick={() => setIsEditingComment(true)}
                                    className={cn(
                                        "min-h-[24px] cursor-text text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap",
                                        !localComment &&
                                            "text-amber-400 dark:text-amber-500 italic",
                                    )}
                                >
                                    {localComment || t("clickToAddComment")}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="relative">
                    <div
                        ref={ref}
                        {...props}
                        className={cn(
                            "relative min-h-20 min-w-64 max-w-96 rounded-lg bg-white shadow-lg border border-gray-200",
                            "dark:bg-gray-800 dark:border-gray-700",
                            selected &&
                                !loading &&
                                !isInCombo &&
                                "ring-2 ring-blue-500 shadow-xl",
                            comboMode &&
                                isModalNode(nodeType) &&
                                isInCombo &&
                                "ring-2 ring-primary shadow-lg shadow-primary/20",
                            className,
                        )}
                    >
                        {/* 旋转光条边框效果 - loading 时显示 */}
                        {loading && (
                            <div
                                className="pointer-events-none absolute -inset-[1px] z-50 rounded-[inherit]"
                                style={{
                                    padding: "3px",
                                    background:
                                        "conic-gradient(from var(--angle, 0deg), transparent 0%, transparent 75%, #ef4444 78%, #f97316 82%, #eab308 86%, #22c55e 90%, #3b82f6 94%, #8b5cf6 98%, transparent 100%)",
                                    mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                                    WebkitMask:
                                        "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                                    WebkitMaskComposite: "xor",
                                    maskComposite: "exclude",
                                    animation:
                                        "rotate-border 4s linear infinite",
                                }}
                            />
                        )}

                        {/* Loading overlay */}
                        {loading && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-white/80 dark:bg-gray-800/80 group/loading">
                                {processingTime > 0 ? (
                                    <div className="flex w-3/4 flex-col items-center gap-1">
                                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                            <div
                                                className="h-full bg-blue-500 transition-all duration-500 ease-out"
                                                style={{
                                                    width: `${Math.min(
                                                        Math.round(
                                                            (elapsedSeconds /
                                                                processingTime) *
                                                                100,
                                                        ),
                                                        99,
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                )}
                                <div className="mt-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
                                    {elapsedSeconds}s
                                </div>
                            </div>
                        )}

                        {/* Stack effect background cards */}
                        {count !== undefined && count > 1 && (
                            <>
                                <div
                                    className="absolute inset-0 -z-10 rounded-lg bg-white shadow-sm dark:bg-gray-800"
                                    style={{
                                        top: "4px",
                                        left: "4px",
                                        right: "-4px",
                                        bottom: "-4px",
                                    }}
                                />
                                {count > 2 && (
                                    <div
                                        className="absolute inset-0 -z-20 rounded-lg bg-white shadow-sm dark:bg-gray-800"
                                        style={{
                                            top: "8px",
                                            left: "8px",
                                            right: "-8px",
                                            bottom: "-8px",
                                        }}
                                    />
                                )}
                            </>
                        )}

                        {/* Count badge */}
                        {count !== undefined && count > 1 && (
                            <div className="absolute -right-2 -top-2 z-20 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-blue-500 px-2 text-xs font-semibold text-white shadow-md">
                                {count}
                            </div>
                        )}

                        {/* Drag handle */}
                        {/* <div className="drag-handle absolute right-2 top-2 z-20 cursor-move rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300">
          <Move className="h-4 w-4" />
        </div> */}

                        {/* Header - 如果 workflowConfig 提供了 title 则自动渲染 */}
                        {workflowConfig?.title && (
                            <NodeHeader>
                                {workflowConfig.icon && (
                                    <NodeHeaderIcon>
                                        {workflowConfig.icon}
                                    </NodeHeaderIcon>
                                )}
                                <NodeHeaderTitle className="flex items-center gap-2">
                                    {workflowConfig.title}
                                </NodeHeaderTitle>
                                <NodeHeaderActions>
                                    {workflowConfig.headerActions}
                                    <NodeHeaderMenuAction
                                        label={t("moreActions")}
                                    />
                                </NodeHeaderActions>
                            </NodeHeader>
                        )}

                        {/* Content */}
                        <div className="relative z-0">{children}</div>

                        {/* Execute Button - 创作模式下显示，或执行模式下的输入节点也显示 */}
                        {workflowConfig?.getPrompts &&
                            (!isExecuteMode || workflowConfig?.isInputNode) && (
                                <div className="p-4 pt-0">
                                    <Button
                                        onClick={executeNew}
                                        disabled={
                                            workflowConfig.executeDisabled ||
                                            loading
                                        }
                                        className="w-full h-10"
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            {workflowConfig.executeIcon ?? (
                                                <Wand2 className="h-4 w-4" />
                                            )}
                                            <span>
                                                {workflowConfig.executeLabel ??
                                                    t("execute")}
                                            </span>
                                        </div>
                                    </Button>
                                </div>
                            )}

                        {/* Overlay Content (e.g. Thinking Process) */}
                        {overlay && (
                            <div className="absolute inset-0 z-[60]">
                                {overlay}
                            </div>
                        )}

                        {/* Combo Mode Floating Selection Button */}
                        {comboMode && isModalNode(nodeType) && (
                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-[100] nodrag">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (nodeId) toggleCombo(nodeId);
                                    }}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 shadow-md",
                                        "border-2 cursor-pointer",
                                        isInCombo
                                            ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                                            : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-primary hover:text-primary",
                                    )}
                                >
                                    {isInCombo ? (
                                        <CheckCircle className="h-3.5 w-3.5" />
                                    ) : (
                                        <Circle className="h-3.5 w-3.5" />
                                    )}
                                    <span>
                                        {isInCombo
                                            ? t("selected")
                                            : t("select")}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* legacy modal deploy dialog removed */}
            </div>
        );
    },
);

BaseNode.displayName = "BaseNode";
