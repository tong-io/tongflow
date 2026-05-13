import { useNodeId, useReactFlow } from "@xyflow/react";
import { useCallback, useLayoutEffect } from "react";
import {
    useNodePluginIds,
    usePluginsRegistry,
} from "@/hooks/use-plugins-registry";

/**
 * Resolves the active plugin for a node given its ABI feature/nodeSlot.
 *
 * Responsibilities:
 * - Ensures the plugins registry is fetched (so `nodePluginMap` populates on canvas).
 * - Reads pluginOptions from the scanned registry (`nodePluginMap[feature]`).
 * - Persists a default `pluginId` into node data before paint so execution hooks
 *   always see a value (avoids run-before-effect race).
 * - Provides `mergePluginIdIntoPrompts` to inject `routing.pluginId` into prompt
 *   objects that don't already carry one.
 */
export function useNodePluginResolver(feature: string | undefined) {
    usePluginsRegistry();
    const nodeId = useNodeId();
    const { updateNodeData, getNode } = useReactFlow();
    const pluginOptions = useNodePluginIds(feature ?? "");
    const defaultPluginIdFromRegistry = (pluginOptions[0] ?? "").trim();

    useLayoutEffect(() => {
        if (!nodeId || !feature) return;
        if (pluginOptions.length === 0) return;
        if (!defaultPluginIdFromRegistry) return;
        const n = getNode(nodeId);
        const d = n?.data as { pluginId?: string } | undefined;
        const current = (
            typeof d?.pluginId === "string" ? d.pluginId : ""
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
                | { pluginId?: string }
                | undefined;
            const fromData = (
                typeof nodeData?.pluginId === "string" ? nodeData.pluginId : ""
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
                const rec = o as Record<string, unknown>;
                const routing = rec.routing;
                const routedPid =
                    routing &&
                    typeof routing === "object" &&
                    !Array.isArray(routing)
                        ? (routing as Record<string, unknown>).pluginId
                        : undefined;
                if (typeof routedPid === "string" && routedPid.trim()) {
                    return o;
                }
                if (typeof rec.pluginId === "string" && rec.pluginId.trim())
                    return o;
                return {
                    ...rec,
                    routing: { pluginId: resolvedPluginId },
                };
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
