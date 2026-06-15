import { useNodeId, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect } from "react";
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
 * - Provides `resolveActivePluginId()` so the execution hook can hand the id
 *   to the create-task API as a top-level field.
 */
export function useNodePluginResolver(feature: string | undefined) {
    usePluginsRegistry();
    const nodeId = useNodeId();
    const { updateNodeData, getNode } = useReactFlow();
    const pluginOptions = useNodePluginIds(feature ?? "");
    const defaultPluginIdFromRegistry = (pluginOptions[0] ?? "").trim();

    // Use a passive useEffect (rather than useLayoutEffect) so the default
    // plugin id write happens after paint. Synchronous writes during the
    // commit phase can fire while sibling components (e.g. SmartIsland) are
    // still rendering, surfacing as "setState while rendering" warnings.
    useEffect(() => {
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

    const resolveActivePluginId = useCallback((): string => {
        if (!nodeId) return defaultPluginIdFromRegistry;
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
        return validData || defaultPluginIdFromRegistry;
    }, [nodeId, getNode, defaultPluginIdFromRegistry, pluginOptions]);

    return {
        pluginOptions,
        defaultPluginIdFromRegistry,
        resolveActivePluginId,
    };
}
