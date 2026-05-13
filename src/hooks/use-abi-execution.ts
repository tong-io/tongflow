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
import { registerAbiNode, unregisterAbiNode } from "@/lib/abi/node-registry";
import {
    buildPrompts,
    collectHandleValues,
    resolveSpec,
} from "@/lib/abi/resolve";
import type { FieldSourceOverride, SourceSpec } from "@/lib/abi/sources";
import { validateAbiInput } from "@/lib/abi/validators";
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
    /** Latest pre-flight validation errors (per ABI field). */
    invalidFields: string[];
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
    const [invalidFields, setInvalidFields] = useState<string[]>([]);

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
    useEffect(() => {
        if (!nodeId) return;
        const { nodes } = storeApi.getState();
        const data =
            (nodes.find((n) => n.id === nodeId)?.data as
                | Record<string, unknown>
                | undefined) ?? {};

        const needsSync = !hasSyncedRef.current && data.feature !== feature;
        if (!needsSync) return;

        hasSyncedRef.current = true;
        flowUpdates(nodeId, { ...data, feature });
    }, [nodeId, feature, storeApi, flowUpdates]);

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

    const { pluginOptions, mergePluginIdIntoPrompts } =
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
        if (prompts.length === 0) return;

        // ajv pre-flight; collect the failing fields for UI feedback.
        const invalid: string[] = [];
        for (const p of prompts) {
            const result = validateAbiInput(feature, p);
            if (!result.valid) {
                for (const e of result.errors) {
                    if (e.field) invalid.push(e.field);
                }
            }
        }
        setInvalidFields([...new Set(invalid)]);
        if (invalid.length > 0) {
            logger.warn(
                `[useAbiExecution] Validation failed for ${feature}; missing/invalid fields:`,
                invalid,
            );
            return;
        }

        const merged = mergePluginIdIntoPrompts(prompts);
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
                  : "";

        if (!pluginId) {
            setMissingPluginOpen(true);
            return;
        }

        updateNodeData(nodeId, {
            feature,
            prompt: merged.length === 1 ? merged[0] : merged,
        });

        try {
            const taskConfigs = merged.map((prompt) => ({
                feature,
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
        mergePluginIdIntoPrompts,
        transformPrompts,
    ]);

    const canRun = !!nodeId && !disabled && !loading && nodeType !== undefined;

    return {
        run,
        loading,
        elapsedSeconds,
        canRun,
        invalidFields,
        feature,
        isExecuteMode,
        missingPluginOpen,
        setMissingPluginOpen,
        pluginOptions,
    };
}
