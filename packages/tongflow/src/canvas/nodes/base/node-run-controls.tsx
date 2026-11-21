"use client";

/**
 * Node menu actions for a host workflow run in flight: "Skip" and "Replace
 * implementation" (the other installed plugins of the node's slot, from the
 * plugins registry). They only appear while the host runner exposes
 * `controls` and its run is in flight on this canvas; otherwise
 * {@link useNodeRunControls} returns `null` and nothing renders.
 */

import { Repeat, SkipForward } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";
import { logger } from "../../../core";
import useFlow from "../../hooks/use-flow";
import {
    useNodePluginIds,
    usePluginsRegistryStore,
} from "../../hooks/use-plugins-registry";
import { useTaskStore } from "../../hooks/use-task";
import { useWorkflowRunSession } from "../../lib/workflow/runner";
import {
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "../../ui/dropdown-menu";
import { pluginDisplayName } from "./node-plugin-id-select";

export interface NodeRunControls {
    /** Not started yet, or running. */
    canSkip: boolean;
    /** Not started yet (swap), or completed / failed (rerun). */
    canReplace: boolean;
    /** Other plugins of the node's slot. */
    alternatives: { pluginId: string; label: string }[];
    skip: () => void;
    replace: (pluginId: string) => void;
}

export function useNodeRunControls(
    nodeId: string | null,
    feature: string | undefined,
): NodeRunControls | null {
    const controls = useWorkflowRunSession((s) => s.runner?.controls);
    const status = useTaskStore(
        useCallback(
            (s) => s.nodeExecutionStatusMap.get(nodeId ?? ""),
            [nodeId],
        ),
    );
    const pluginIds = useNodePluginIds(feature ?? "");
    const pluginsMeta = usePluginsRegistryStore((s) => s.registry?.plugins);
    const currentPluginId = useFlow(
        useCallback(
            (s) => {
                const data = s.nodes.find((n) => n.id === nodeId)?.data as
                    | Record<string, unknown>
                    | undefined;
                return typeof data?.pluginId === "string" ? data.pluginId : "";
            },
            [nodeId],
        ),
    );

    const alternatives = useMemo(() => {
        const current = currentPluginId || pluginIds[0] || "";
        return pluginIds
            .filter((id) => id !== current)
            .map((id) => ({
                pluginId: id,
                label: pluginsMeta?.[id]?.name || pluginDisplayName(id),
            }));
    }, [pluginIds, pluginsMeta, currentPluginId]);

    const skip = useCallback(() => {
        if (!controls || !nodeId) return;
        if (!controls.skipNode(nodeId)) {
            logger.warn(`[workflow-runner] Skip of ${nodeId} was refused`);
        }
    }, [controls, nodeId]);

    const replace = useCallback(
        (pluginId: string) => {
            if (!controls || !nodeId) return;
            if (!controls.replaceImplementation(nodeId, { pluginId })) {
                logger.warn(
                    `[workflow-runner] Replacing the implementation of ${nodeId} was refused`,
                );
                return;
            }
            // Keep the canvas in step with what now runs.
            const flow = useFlow.getState();
            const node = flow.nodes.find((n) => n.id === nodeId);
            if (node) {
                flow.updates(nodeId, {
                    ...(node.data as Record<string, unknown>),
                    pluginId,
                });
            }
        },
        [controls, nodeId],
    );

    if (!controls || !nodeId || !feature) return null;
    return {
        canSkip: status === undefined || status === "running",
        canReplace:
            status === undefined ||
            status === "completed" ||
            status === "failed",
        alternatives,
        skip,
        replace,
    };
}

/** Dropdown items for {@link useNodeRunControls}; render inside a node menu. */
export function NodeRunControlMenuItems({
    controls,
}: {
    controls: NodeRunControls;
}) {
    const t = useTranslations("Workspace.nodes.base");
    return (
        <>
            {controls.canSkip && (
                <DropdownMenuItem onClick={controls.skip}>
                    <SkipForward className="mr-2 h-4 w-4" />
                    {t("skipNode")}
                </DropdownMenuItem>
            )}
            {controls.canReplace && (
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <Repeat className="mr-2 h-4 w-4" />
                        {t("replaceImplementation")}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        {controls.alternatives.length === 0 ? (
                            <DropdownMenuItem disabled>
                                {t("replaceImplementationEmpty")}
                            </DropdownMenuItem>
                        ) : (
                            controls.alternatives.map((alt) => (
                                <DropdownMenuItem
                                    key={alt.pluginId}
                                    onClick={() =>
                                        controls.replace(alt.pluginId)
                                    }
                                >
                                    {alt.label}
                                </DropdownMenuItem>
                            ))
                        )}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            )}
        </>
    );
}
