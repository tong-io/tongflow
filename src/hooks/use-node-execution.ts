import { useEffect, useState, useCallback, useRef } from "react";
import { useNodeId, useReactFlow, useStore, useStoreApi } from "@xyflow/react";

import {
    useTaskStore,
    useBatchTaskManager,
    useNodeTaskUpdate,
} from "@/hooks/use-task";
import useFlow from "@/hooks/use-flow";
import type { BaseNodeData, OutputNodeType } from "@/types/nodes";
import {
    registerNodeExecutionConfig,
    type NodeExecutionConfig,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import {
    normalizeTaskPayloadData,
    pickMarkdownFromPayload,
    applyResolvedOutputRoutes,
} from "@/utils/task-payload";
import {
    getAbiNodeBySlot,
    resolveAbiOutputMappings,
} from "@/lib/tongflow-abi";
import { getValueByPath } from "@/utils/path-utils";
import { useNodePluginResolver } from "./use-node-plugin-resolver";
import { logger } from "@/lib/logger";

/* ------------------------------------------------------------------ */
/* Pure helpers (no hooks)                                             */
/* ------------------------------------------------------------------ */

function edgeMatchesTargetHandle(
    edgeTarget: string | null | undefined,
    requested: string,
): boolean {
    if (requested === "a") {
        return (
            edgeTarget === undefined ||
            edgeTarget === null ||
            edgeTarget === "a"
        );
    }
    return edgeTarget === requested;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export interface UseNodeExecutionConfig {
    workflowConfig?: Omit<NodeExecutionConfig, "nodeType">;
    data?: BaseNodeData;
}

export function useNodeExecution({
    workflowConfig,
    data,
}: UseNodeExecutionConfig) {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [missingPluginOpen, setMissingPluginOpen] = useState(false);

    const nodeId = useNodeId();
    const { updateNodeData } = useReactFlow();
    const storeApi = useStoreApi();
    const flowUpdates = useFlow((s) => s.updates);

    const nodeType = useStore((state) => {
        const node = state.nodeLookup.get(nodeId ?? "");
        return node?.type;
    });

    /* ---------- config registration + data sync -------------------- */

    const hasSyncedConfigRef = useRef(false);

    useEffect(() => {
        if (workflowConfig && nodeType) {
            registerNodeExecutionConfig({ nodeType, ...workflowConfig });

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
                if (workflowConfig.outputType)
                    configToSync.outputType = workflowConfig.outputType;
                if (workflowConfig.outputField)
                    configToSync.outputField = workflowConfig.outputField;
                if (workflowConfig.paramMappings)
                    configToSync.paramMappings = workflowConfig.paramMappings;
                if (workflowConfig.supportsBatch !== undefined)
                    configToSync.supportsBatch = workflowConfig.supportsBatch;
                if (workflowConfig.batchParam)
                    configToSync.batchParam = workflowConfig.batchParam;

                flowUpdates(nodeId, { ...data, ...configToSync });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- register once per nodeType
    }, [nodeType]);

    useEffect(() => {
        hasSyncedConfigRef.current = false;
    }, [workflowConfig?.feature]);

    /* ---------- derived values ------------------------------------- */

    const feature = workflowConfig?.feature ?? data?.feature;
    const outputType = workflowConfig?.outputType ?? data?.outputType;
    const outputField = workflowConfig?.outputField ?? data?.outputField;

    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const isExecuteMode = workspaceMode === "execute";

    const nodeExecutionStatus = useTaskStore(
        useCallback(
            (state) => state.nodeExecutionStatusMap.get(nodeId ?? ""),
            [nodeId],
        ),
    );

    const expands = useFlow((s) => s.expands);
    const { isLoading: taskLoading, createBatchTasks } =
        useBatchTaskManager();

    const loading = taskLoading || nodeExecutionStatus === "running";

    /* ---------- plugin resolution ---------------------------------- */

    const { pluginOptions, mergePluginIdIntoPrompts } =
        useNodePluginResolver(feature);

    /* ---------- task update handler -------------------------------- */

    const handleTaskUpdate = useCallback(
        (task: any) => {
            if (!nodeId || !feature) return;

            if (workflowConfig?.onTaskUpdate) {
                const handled = workflowConfig.onTaskUpdate(task);
                if (handled) return;
            }

            if (task?.status === "COMPLETED") {
                const payload =
                    normalizeTaskPayloadData(task?.data) ??
                    (task?.data as Record<string, unknown> | undefined);

                // ABI convention-driven multi-output routing
                const abiNode = feature
                    ? getAbiNodeBySlot(feature)
                    : undefined;
                const routes = abiNode
                    ? resolveAbiOutputMappings(abiNode)
                    : [];
                if (routes.length > 0) {
                    applyResolvedOutputRoutes(nodeId, payload, routes, expands);
                    return;
                }

                // Single-output fallback
                const outputNodeType = outputType as
                    | OutputNodeType
                    | undefined;
                const outputDataField = outputField as
                    | "fileKeys"
                    | "texts"
                    | undefined;
                if (!outputNodeType || !outputDataField) return;

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
                logger.error(
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

    useNodeTaskUpdate(nodeId ?? "", handleTaskUpdate);

    /* ---------- prompts context builder ----------------------------- */

    const getPromptsContext = useCallback((): GetPromptsContext => {
        const { nodeLookup, edges } = storeApi.getState();

        const getUpstreamData = (
            upstreamType: string,
            field: string,
        ): unknown => {
            if (!nodeId) return undefined;
            const incomingEdges = edges.filter((e) => e.target === nodeId);
            for (const edge of incomingEdges) {
                const sourceNode = nodeLookup.get(edge.source);
                if (sourceNode && sourceNode.type === upstreamType) {
                    return getValueByPath(
                        sourceNode.data as Record<string, unknown>,
                        field,
                    );
                }
            }
            return undefined;
        };

        const getAllUpstreamData = (
            upstreamType: string,
            field: string,
        ): unknown[] => {
            if (!nodeId) return [];
            const incomingEdges = edges.filter((e) => e.target === nodeId);
            const results: unknown[] = [];
            for (const edge of incomingEdges) {
                const sourceNode = nodeLookup.get(edge.source);
                if (sourceNode && sourceNode.type === upstreamType) {
                    const value = getValueByPath(
                        sourceNode.data as Record<string, unknown>,
                        field,
                    );
                    if (value !== undefined) {
                        if (Array.isArray(value)) results.push(...value);
                        else results.push(value);
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
                if (!edgeMatchesTargetHandle(edge.targetHandle, targetHandle))
                    continue;
                const sourceNode = nodeLookup.get(edge.source);
                if (sourceNode && sourceNode.type === upstreamType) {
                    return getValueByPath(
                        sourceNode.data as Record<string, unknown>,
                        field,
                    );
                }
            }
            return undefined;
        };

        return {
            getUpstreamData,
            getAllUpstreamData,
            getUpstreamDataForTargetHandle,
        };
    }, [nodeId, storeApi]);

    /* ---------- execute -------------------------------------------- */

    const performExecute = useCallback(async () => {
        if (!nodeId || !feature || !workflowConfig?.getPrompts) return;

        const context = getPromptsContext();
        const rawPrompts = workflowConfig
            .getPrompts(context)
            .map((p) => p as Record<string, unknown>);
        const prompts = mergePluginIdIntoPrompts(rawPrompts);
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
            logger.error(`[BaseNode] Failed to create tasks:`, error);
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
        mergePluginIdIntoPrompts,
    ]);

    const executeNew = useCallback(async () => {
        if (!nodeId || !feature || !workflowConfig?.getPrompts) return;

        const context = getPromptsContext();
        const raw = workflowConfig
            .getPrompts(context)
            .map((p) => p as Record<string, unknown>);
        const merged = mergePluginIdIntoPrompts(raw);
        const first = merged[0] as Record<string, unknown> | undefined;
        const routing =
            first?.routing && typeof first.routing === "object"
                ? (first.routing as Record<string, unknown>)
                : undefined;
        const pluginId =
            routing && typeof routing.pluginId === "string"
                ? routing.pluginId.trim()
                : first && typeof first.pluginId === "string"
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
        mergePluginIdIntoPrompts,
    ]);

    /* ---------- elapsed timer -------------------------------------- */

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

    /* ---------- return --------------------------------------------- */

    return {
        loading,
        elapsedSeconds,
        executeNew,
        isExecuteMode,
        feature,
        pluginOptions,
        missingPluginOpen,
        setMissingPluginOpen,
    };
}
