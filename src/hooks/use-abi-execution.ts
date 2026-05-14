/**
 * ABI-driven node execution hook.
 *
 * Responsibilities:
 *  - Register the node into the ABI registry on mount
 *  - Sync `feature` into `node.data` (so persisted workflows know the ABI slot)
 *  - Build prompts via `resolve.ts` (handle-driven upstream collection)
 *  - ajv pre-flight validation before submitting tasks
 *  - Wire SSE task updates to ABI output routing (resolveAbiOutputMappings)
 */

import { useNodeId, useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeSlot } from "@/generated/abi";
import useFlow from "@/hooks/use-flow";
import {
    useBatchTaskManager,
    useNodeTaskUpdate,
    useTaskStore,
} from "@/hooks/use-task";
import { resolveEdgeHandles } from "@/lib/abi/node-feature-registry";
import { registerAbiNode, unregisterAbiNode } from "@/lib/abi/node-registry";
import {
    buildPrompts,
    collectHandleValues,
    resolveSpec,
} from "@/lib/abi/resolve";
import type { FieldSourceOverride, SourceSpec } from "@/lib/abi/sources";
import { logger } from "@/lib/logger";
import {
    getAbiNodeBySlot,
    resolveAbiOutputMappings,
} from "@/lib/schema/tongflow-abi";
import {
    applyResolvedOutputRoutes,
    normalizeTaskPayloadData,
} from "@/lib/task/payload";

import type { UseAbiFormReturn } from "./use-abi-form";
import { useNodePluginResolver } from "./use-node-plugin-resolver";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface UseAbiExecutionOptions<F extends NodeSlot> {
    feature: F;
    sourceSpec?: SourceSpec<F>;
    /** Optional pairing with useAbiForm to read config values. */
    form?: UseAbiFormReturn<F>;
    /** Force-disable execution from the calling node. */
    disabled?: boolean;
    /**
     * Custom task update handler. Return `true` to mark the event handled
     * (skips the default ABI output routing).
     */
    onTaskUpdate?: (
        task: any,
    ) => boolean | undefined | Promise<boolean | undefined>;
    /**
     * Final-stage transform applied to the prompts produced by `buildPrompts`.
     * Use as an escape hatch for nodes that need to emit multiple prompts based
     * on local React state (e.g. a list-driven node with no upstream batch).
     */
    transformPrompts?: (
        prompts: Record<string, unknown>[],
    ) => Record<string, unknown>[];
}

export interface UseAbiExecutionReturn {
    /** Execute one batch (single click). */
    run: () => Promise<void>;
    loading: boolean;
    elapsedSeconds: number;
    canRun: boolean;
    /** ABI feature being executed. */
    feature: string;
    /** Whether running in execute-mode (vs design mode). */
    isExecuteMode: boolean;
    /** Missing plugin dialog state (canvas execute UX). */
    missingPluginOpen: boolean;
    setMissingPluginOpen: (open: boolean) => void;
    /** Lazily resolved plugin options (used by NodePluginIdSelect). */
    pluginOptions: ReturnType<typeof useNodePluginResolver>["pluginOptions"];
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useAbiExecution<F extends NodeSlot>(
    opts: UseAbiExecutionOptions<F>,
): UseAbiExecutionReturn {
    const {
        feature,
        sourceSpec,
        form,
        disabled,
        onTaskUpdate,
        transformPrompts,
    } = opts;

    const nodeId = useNodeId();
    const { updateNodeData } = useReactFlow();
    const storeApi = useStoreApi();
    const flowUpdates = useFlow((s) => s.updates);

    const nodeType = useStore((state) => {
        const node = state.nodeLookup.get(nodeId ?? "");
        return node?.type;
    });

    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [missingPluginOpen, setMissingPluginOpen] = useState(false);

    /* ---------- spec resolution (memo via feature/sourceSpec ref) ---- */

    const specRef = useRef(
        resolveSpec(
            feature,
            sourceSpec as Record<string, FieldSourceOverride> | undefined,
        ),
    );
    useEffect(() => {
        specRef.current = resolveSpec(
            feature,
            sourceSpec as Record<string, FieldSourceOverride> | undefined,
        );
    }, [feature, sourceSpec]);

    /* ---------- registry + node.data sync ---------------------------- */

    const hasSyncedRef = useRef(false);

    useEffect(() => {
        if (!nodeId) return;
        registerAbiNode({
            nodeId,
            feature,
            sourceSpec:
                (sourceSpec as
                    | Record<string, FieldSourceOverride>
                    | undefined) ?? {},
        });
        return () => {
            unregisterAbiNode(nodeId);
        };
    }, [nodeId, feature, sourceSpec]);

    // Mirror just `feature` into node.data — required so persisted workflows
    // can be restored knowing which ABI slot a node is. `outputType` /
    // `outputField` are derived on-demand from the registry, not mirrored.
    // Deferred to a microtask so the flow-store write can't interleave with
    // a sibling component's render (which surfaced as a "setState while
    // rendering SmartIsland" warning).
    useEffect(() => {
        if (!nodeId) return;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            const { nodes } = storeApi.getState();
            const data =
                (nodes.find((n) => n.id === nodeId)?.data as
                    | Record<string, unknown>
                    | undefined) ?? {};

            const needsSync = !hasSyncedRef.current && data.feature !== feature;
            if (!needsSync) return;

            hasSyncedRef.current = true;
            flowUpdates(nodeId, { ...data, feature });
        });
        return () => {
            cancelled = true;
        };
    }, [nodeId, feature, storeApi, flowUpdates]);

    // Heal incoming edges that lack `targetHandle` / `sourceHandle` (e.g. from
    // saved workflows or pre-fix `expands`/`compose` spawns). Without these,
    // `collectHandleValues` can't match the edge to a handle field and the
    // execute click silently produces no prompts.
    //
    // Subscribed to edge changes (via the `incomingEdgeSig` selector) so we
    // also catch edges that arrive after the node first mounts — e.g. a
    // workflow restored from the server in a later tick. The patch itself is
    // idempotent (skips edges already carrying both handle ids).
    const incomingEdgeSig = useFlow((s) =>
        nodeId
            ? s.edges
                  .filter((e) => e.target === nodeId)
                  .map(
                      (e) =>
                          `${e.id}|${e.sourceHandle ?? ""}|${e.targetHandle ?? ""}`,
                  )
                  .join(";")
            : "",
    );
    useEffect(() => {
        if (!nodeId) return;
        const flowState = useFlow.getState();
        const targetType = flowState.nodes.find((n) => n.id === nodeId)?.type;
        const broken = flowState.edges.filter(
            (e) =>
                e.target === nodeId && (!e.targetHandle || !e.sourceHandle),
        );
        if (broken.length === 0) return;
        const usedTargetHandles = new Set<string>(
            flowState.edges
                .filter((e) => e.target === nodeId && e.targetHandle)
                .map((e) => e.targetHandle as string),
        );
        let mutated = false;
        const patched = flowState.edges.map((edge) => {
            if (edge.target !== nodeId) return edge;
            if (edge.targetHandle && edge.sourceHandle) return edge;
            const sourceType = flowState.nodes.find(
                (n) => n.id === edge.source,
            )?.type;
            const { sourceHandle, targetHandle } = resolveEdgeHandles({
                sourceType,
                targetType,
                usedTargetHandles,
                // Crucial: the resolved spec respects per-node `sourceSpec`
                // overrides that promote bare-string ABI inputs (classified
                // as config by topology) into handles — e.g. `gen-text.text`.
                targetSpec: specRef.current,
            });
            if (!sourceHandle && !targetHandle) return edge;
            if (targetHandle) usedTargetHandles.add(targetHandle);
            mutated = true;
            return {
                ...edge,
                ...(edge.sourceHandle
                    ? {}
                    : sourceHandle
                      ? { sourceHandle }
                      : {}),
                ...(edge.targetHandle
                    ? {}
                    : targetHandle
                      ? { targetHandle }
                      : {}),
            };
        });
        if (mutated) flowState.setEdges(patched);
    }, [nodeId, incomingEdgeSig]);

    /* ---------- mode / loading / output routing --------------------- */

    const workspaceMode = useTaskStore((s) => s.workspaceMode);
    const isExecuteMode = workspaceMode === "execute";

    const nodeExecutionStatus = useTaskStore(
        useCallback(
            (s) => s.nodeExecutionStatusMap.get(nodeId ?? ""),
            [nodeId],
        ),
    );

    const expands = useFlow((s) => s.expands);
    const { isLoading: taskLoading, createBatchTasks } = useBatchTaskManager();
    const loading = taskLoading || nodeExecutionStatus === "running";

    const { pluginOptions, resolveActivePluginId } =
        useNodePluginResolver(feature);

    const handleTaskUpdate = useCallback(
        async (task: any) => {
            if (!nodeId) return;

            if (onTaskUpdate) {
                const handled = await onTaskUpdate(task);
                if (handled) return;
            }

            if (task?.status === "COMPLETED") {
                const payload =
                    normalizeTaskPayloadData(task?.data) ??
                    (task?.data as Record<string, unknown> | undefined);

                const abiNode = getAbiNodeBySlot(feature);
                const routes = abiNode ? resolveAbiOutputMappings(abiNode) : [];
                if (routes.length > 0) {
                    applyResolvedOutputRoutes(nodeId, payload, routes, expands);
                }
                return;
            }

            if (task?.status === "FAILED") {
                logger.error(
                    `[useAbiExecution] Task failed for node ${nodeId}:`,
                    task,
                );
            }
        },
        [nodeId, feature, expands, onTaskUpdate],
    );

    useNodeTaskUpdate(nodeId ?? "", handleTaskUpdate);

    /* ---------- elapsed timer --------------------------------------- */

    useEffect(() => {
        if (!loading) {
            setElapsedSeconds(0);
            return;
        }
        const interval = setInterval(() => {
            setElapsedSeconds((p) => p + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [loading]);

    /* ---------- run -------------------------------------------------- */

    const run = useCallback(async () => {
        if (!nodeId) return;
        const spec = specRef.current;
        const { nodes, edges } = storeApi.getState();

        const handleValues = collectHandleValues(nodeId, spec, nodes, edges);
        const configValues = (form?.state as Record<string, unknown>) ?? {};

        const built = buildPrompts({ spec, configValues, handleValues });
        const prompts = transformPrompts ? transformPrompts(built) : built;
        if (prompts.length === 0) {
            const incomingEdges = edges.filter((e) => e.target === nodeId);
            const upstreamSnapshot = incomingEdges.map((e) => {
                const src = nodes.find((n) => n.id === e.source);
                return {
                    edgeId: e.id,
                    source: e.source,
                    sourceType: src?.type,
                    sourceData: src?.data,
                    sourceHandle: e.sourceHandle,
                    targetHandle: e.targetHandle,
                };
            });
            logger.warn(
                `[useAbiExecution] No prompts built for ${feature}; node ${nodeId} has no upstream handle values for batch field`,
                {
                    spec,
                    handleValues,
                    configValues,
                    incomingEdgeCount: incomingEdges.length,
                    incomingEdges: upstreamSnapshot,
                },
            );
            return;
        }

        const pluginId = resolveActivePluginId();
        if (!pluginId) {
            setMissingPluginOpen(true);
            return;
        }

        updateNodeData(nodeId, {
            feature,
            prompt: prompts.length === 1 ? prompts[0] : prompts,
        });

        try {
            const taskConfigs = prompts.map((prompt) => ({
                feature,
                pluginId,
                prompt,
                nodeId,
            }));
            await createBatchTasks(taskConfigs);
        } catch (error) {
            logger.error(`[useAbiExecution] Failed to create tasks:`, error);
        }
    }, [
        nodeId,
        feature,
        form,
        storeApi,
        updateNodeData,
        createBatchTasks,
        resolveActivePluginId,
        transformPrompts,
    ]);

    const canRun = !!nodeId && !disabled && !loading && nodeType !== undefined;

    return {
        run,
        loading,
        elapsedSeconds,
        canRun,
        feature,
        isExecuteMode,
        missingPluginOpen,
        setMissingPluginOpen,
        pluginOptions,
    };
}
