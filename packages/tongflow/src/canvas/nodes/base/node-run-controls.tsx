"use client";

/**
 * Node menu actions for a host workflow run in flight: "Skip" and "Replace
 * implementation": the other models of the current plugin's slot entry
 * (`methodsByNodeSlot[slot].models`, e.g. an edge plugin's manifest `models`)
 * followed by the other installed plugins of the node's slot, from the
 * plugins registry. They only appear while the host runner exposes
 * `controls` and its run is in flight on this canvas; otherwise
 * {@link useNodeRunControls} returns `null` and nothing renders.
 */

import { Check, Repeat, SkipForward } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";
import { logger } from "../../../core";
import useFlow from "../../hooks/use-flow";
import {
    getNodePluginModels,
    useNodePluginIds,
    useNodePluginModels,
    usePluginsRegistryStore,
} from "../../hooks/use-plugins-registry";
import { useTaskStore } from "../../hooks/use-task";
import { useWorkflowRunSession } from "../../lib/workflow/runner";
import {
    DropdownMenuItem,
    DropdownMenuSeparator,
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
    /**
     * The models of the current plugin's slot entry, in declared order, with
     * the one the node uses marked `current`. Empty when the plugin declares
     * fewer than two (nothing to switch to).
     */
    models: { model: string; current: boolean }[];
    /** Other plugins of the node's slot. */
    alternatives: { pluginId: string; label: string }[];
    skip: () => void;
    /** Switch to another plugin (it runs on its default model). */
    replace: (pluginId: string) => void;
    /** Switch the current plugin to another of its models. */
    replaceModel: (model: string) => void;
}

/**
 * What "Replace implementation" offers: the current plugin's models (when it
 * declares at least two) and the slot's other plugins. The current model is
 * the node's `pluginModel` when the plugin declares it, else the plugin's
 * default (first declared), as the model select and the run resolve it.
 */
export function implementationChoices(input: {
    pluginIds: readonly string[];
    currentPluginId: string;
    models: readonly string[];
    currentModel: string;
    pluginName?: (pluginId: string) => string | undefined;
}): Pick<NodeRunControls, "models" | "alternatives"> {
    const current = input.currentPluginId || input.pluginIds[0] || "";
    const model = input.models.includes(input.currentModel)
        ? input.currentModel
        : (input.models[0] ?? "");
    return {
        models:
            input.models.length > 1
                ? input.models.map((m) => ({ model: m, current: m === model }))
                : [],
        alternatives: input.pluginIds
            .filter((id) => id !== current)
            .map((id) => ({
                pluginId: id,
                label: input.pluginName?.(id) || pluginDisplayName(id),
            })),
    };
}

function stringField(data: unknown, key: string): string {
    const value = (data as Record<string, unknown> | undefined)?.[key];
    return typeof value === "string" ? value.trim() : "";
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
            (s) =>
                stringField(
                    s.nodes.find((n) => n.id === nodeId)?.data,
                    "pluginId",
                ),
            [nodeId],
        ),
    );
    const currentModel = useFlow(
        useCallback(
            (s) =>
                stringField(
                    s.nodes.find((n) => n.id === nodeId)?.data,
                    "pluginModel",
                ),
            [nodeId],
        ),
    );
    const activePluginId = currentPluginId || pluginIds[0] || "";
    const models = useNodePluginModels(feature ?? "", activePluginId);

    const { models: modelChoices, alternatives } = useMemo(
        () =>
            implementationChoices({
                pluginIds,
                currentPluginId,
                models,
                currentModel,
                pluginName: (id) => pluginsMeta?.[id]?.name,
            }),
        [pluginIds, pluginsMeta, currentPluginId, models, currentModel],
    );

    const skip = useCallback(() => {
        if (!controls || !nodeId) return;
        if (!controls.skipNode(nodeId)) {
            logger.warn(`[workflow-runner] Skip of ${nodeId} was refused`);
        }
    }, [controls, nodeId]);

    /** Ask the run to switch, then keep the canvas in step with what now runs. */
    const apply = useCallback(
        (pluginId: string, model: string | undefined) => {
            if (!controls || !nodeId || !pluginId) return;
            if (
                !controls.replaceImplementation(nodeId, {
                    pluginId,
                    ...(model ? { model } : {}),
                })
            ) {
                logger.warn(
                    `[workflow-runner] Replacing the implementation of ${nodeId} was refused`,
                );
                return;
            }
            const flow = useFlow.getState();
            const node = flow.nodes.find((n) => n.id === nodeId);
            if (!node) return;
            const { pluginModel: _old, ...data } = node.data as Record<
                string,
                unknown
            >;
            flow.updates(nodeId, {
                ...data,
                pluginId,
                ...(model ? { pluginModel: model } : {}),
            });
        },
        [controls, nodeId],
    );

    // Another plugin runs on its default model: the first it declares.
    const replace = useCallback(
        (pluginId: string) =>
            apply(pluginId, getNodePluginModels(feature ?? "", pluginId)[0]),
        [apply, feature],
    );

    const replaceModel = useCallback(
        (model: string) => apply(activePluginId, model),
        [apply, activePluginId],
    );

    if (!controls || !nodeId || !feature) return null;
    return {
        canSkip: status === undefined || status === "running",
        canReplace:
            status === undefined ||
            status === "completed" ||
            status === "failed",
        models: modelChoices,
        alternatives,
        skip,
        replace,
        replaceModel,
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
                        {controls.models.length === 0 &&
                        controls.alternatives.length === 0 ? (
                            <DropdownMenuItem disabled>
                                {t("replaceImplementationEmpty")}
                            </DropdownMenuItem>
                        ) : null}
                        {controls.models.map(({ model, current }) => (
                            <DropdownMenuItem
                                key={`model:${model}`}
                                disabled={current}
                                onClick={() => controls.replaceModel(model)}
                            >
                                <Check
                                    className={`mr-2 h-4 w-4 ${current ? "" : "invisible"}`}
                                />
                                {t("replaceImplementationModel", { model })}
                            </DropdownMenuItem>
                        ))}
                        {controls.models.length > 0 &&
                        controls.alternatives.length > 0 ? (
                            <DropdownMenuSeparator />
                        ) : null}
                        {controls.alternatives.map((alt) => (
                            <DropdownMenuItem
                                key={alt.pluginId}
                                onClick={() => controls.replace(alt.pluginId)}
                            >
                                {alt.label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            )}
        </>
    );
}
