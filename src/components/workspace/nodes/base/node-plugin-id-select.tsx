"use client";

import { useNodeId } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import useFlow from "@/hooks/use-flow";
import {
    useNodePluginIds,
    usePluginsRegistry,
    usePluginsRegistryStore,
} from "@/hooks/use-plugins-registry";
import type { BaseNodeData } from "@/types/nodes";
import { NodePluginSelect } from "./node-plugin-select";

export function pluginDisplayName(pluginId: string): string {
    const parts = pluginId.split("-").filter(Boolean);
    // Strip only the leading vendor prefix, keep the type segment
    // (e.g. "tongflow-api-openai" -> "api-openai").
    const semantic = parts[0] === "tongflow" ? parts.slice(1) : parts;
    return semantic.join("-");
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
    const t = useTranslations("Workspace.nodes.base");
    const isLoading = usePluginsRegistryStore((s) => s.isLoading);
    const isLoaded = usePluginsRegistryStore((s) => s.isLoaded);
    const loadError = usePluginsRegistryStore((s) => s.error);

    const { resolved, pluginOptions } = useResolvedPluginId(
        nodeSlot,
        data,
        dataKey,
    );

    const options = useMemo(
        () =>
            pluginOptions.map((pid) => ({
                value: pid,
                label: pluginDisplayName(pid),
            })),
        [pluginOptions],
    );

    const title = (
        <Label className="text-sm font-medium text-muted-foreground">
            {t("pluginImplementationTitle")}
        </Label>
    );

    if (loadError) {
        return (
            <Card className="p-3 border-destructive/40">
                <div className="space-y-2">
                    {title}
                    <p className="text-xs text-destructive leading-snug">
                        {t("pluginRegistryLoadError", {
                            message: loadError.message,
                        })}
                    </p>
                </div>
            </Card>
        );
    }

    if (isLoading || !isLoaded) {
        return (
            <Card className="p-3">
                <div className="space-y-2">
                    {title}
                    <p className="text-xs text-muted-foreground">
                        {t("pluginImplementationLoading")}
                    </p>
                </div>
            </Card>
        );
    }

    if (options.length === 0) {
        return (
            <Card className="p-3 border-dashed border-border">
                <div className="space-y-2">
                    {title}
                    <p className="text-xs text-muted-foreground leading-snug">
                        {t("pluginImplementationEmpty")}
                    </p>
                </div>
            </Card>
        );
    }

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
