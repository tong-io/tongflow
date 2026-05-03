"use client";

import { useNodeId } from "@xyflow/react";
import { useMemo } from "react";
import useFlow from "@/hooks/use-flow";
import {
    useNodePluginIds,
    usePluginsRegistry,
} from "@/hooks/use-plugins-registry";
import type { BaseNodeData } from "@/types/nodes";
import { NodePluginSelect } from "./node-plugin-select";

export function pluginDisplayName(pluginId: string): string {
    const parts = pluginId.split("-").filter(Boolean);
    const semantic =
        parts[0] === "tongflow" && (parts[1] === "modal" || parts[1] === "llm")
            ? parts.slice(2)
            : parts;
    return semantic
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

type NodePluginIdSelectProps = {
    nodeSlot: string;
    data: BaseNodeData;
    /**
     * By default, writes `{ pluginId }` onto node data.
     * Use this when a node stores plugin id under a different key.
     */
    dataKey?: string;
};

export function useResolvedPluginId(
    nodeSlot: string,
    data: BaseNodeData,
    dataKey: string = "pluginId",
): { current: string; resolved: string; pluginOptions: string[] } {
    usePluginsRegistry();
    const pluginOptions = useNodePluginIds(nodeSlot);
    const current = String(data[dataKey] ?? data.pluginRepo ?? "").trim();
    const resolved = (current || pluginOptions[0] || "").trim();
    return { current, resolved, pluginOptions };
}

/**
 * Plugin implementation selector for a fixed ABI `nodeSlot`.
 * Options come from scanned registry: `nodePluginMap[nodeSlot]`.
 */
export function NodePluginIdSelect({
    nodeSlot,
    data,
    dataKey = "pluginId",
}: NodePluginIdSelectProps) {
    const id = useNodeId()!;
    const updates = useFlow((s) => s.updates);
    const { resolved, pluginOptions } = useResolvedPluginId(
        nodeSlot,
        data,
        dataKey,
    );
    // Default pluginId is written by BaseNode (nodePluginMap[slot][0]).

    const options = useMemo(
        () =>
            pluginOptions.map((pid) => ({
                value: pid,
                label: pluginDisplayName(pid),
            })),
        [pluginOptions],
    );

    if (options.length === 0) return null;

    return (
        <NodePluginSelect
            value={resolved}
            onValueChange={(value) =>
                updates(id, { ...data, [dataKey]: value })
            }
            options={options}
        />
    );
}
