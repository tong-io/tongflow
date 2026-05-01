import { useLayoutEffect, useCallback } from "react";
import { useNodeId, useReactFlow } from "@xyflow/react";
import { useNodePluginIds } from "@/hooks/use-plugins-registry";

/**
 * Resolves the active plugin for a node given its ABI feature/nodeSlot.
 *
 * Responsibilities:
 * - Reads pluginOptions from the scanned registry (`nodePluginMap[feature]`).
 * - Persists a default `pluginId` into node data before paint so getPrompts()
 *   closures always see a value (avoids run-before-effect race).
 * - Provides `mergePluginIdIntoPrompts` to inject pluginId into prompt objects
 *   that don't already carry one.
 */
export function useNodePluginResolver(feature: string | undefined) {
    const nodeId = useNodeId();
    const { updateNodeData, getNode } = useReactFlow();
    const pluginOptions = useNodePluginIds(feature ?? "");
    const defaultPluginIdFromRegistry = (pluginOptions[0] ?? "").trim();

    useLayoutEffect(() => {
        if (!nodeId || !feature) return;
        if (pluginOptions.length === 0) return;
        if (!defaultPluginIdFromRegistry) return;
        const n = getNode(nodeId);
        const d = n?.data as
            | { pluginId?: string; pluginRepo?: string }
            | undefined;
        const current = (
            typeof d?.pluginId === "string"
                ? d.pluginId
                : typeof d?.pluginRepo === "string"
                  ? d.pluginRepo
                  : ""
        ).trim();
        if (current && pluginOptions.includes(current)) return;
        updateNodeData(nodeId, { pluginId: defaultPluginIdFromRegistry });
    }, [
        nodeId,
        feature,
        defaultPluginIdFromRegistry,
        getNode,
        updateNodeData,
        pluginOptions,
    ]);

    const mergePluginIdIntoPrompts = useCallback(
        (prompts: Record<string, unknown>[]): Record<string, unknown>[] => {
            if (!nodeId) return prompts;
            const n = getNode(nodeId);
            const nodeData = (n?.data ?? undefined) as
                | { pluginId?: string; pluginRepo?: string }
                | undefined;
            const fromData = (
                typeof nodeData?.pluginId === "string"
                    ? nodeData.pluginId
                    : typeof nodeData?.pluginRepo === "string"
                      ? nodeData.pluginRepo
                      : ""
            ).trim();
            const validData = !fromData
                ? ""
                : pluginOptions.length === 0
                  ? fromData
                  : pluginOptions.includes(fromData)
                    ? fromData
                    : "";
            const resolvedPluginId = validData || defaultPluginIdFromRegistry;
            if (!resolvedPluginId) return prompts;
            return prompts.map((o) => {
                if (typeof o.pluginId === "string" && o.pluginId.trim())
                    return o;
                if (typeof o.pluginRepo === "string" && o.pluginRepo.trim())
                    return o;
                return { ...o, pluginId: resolvedPluginId };
            });
        },
        [nodeId, getNode, defaultPluginIdFromRegistry, pluginOptions],
    );

    return {
        pluginOptions,
        defaultPluginIdFromRegistry,
        mergePluginIdIntoPrompts,
    };
}
