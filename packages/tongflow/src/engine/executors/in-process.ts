/**
 * Edge executor without a Web Worker: calls a browser plugin's methods on the
 * calling thread. For tests and for hosts (Node, scripts) that have no Worker.
 * Same registry lookups and method calls as the worker executor.
 */

import type { PluginConfig } from "../../core/registry/plugins-registry-schema";
import type { InvokeRequest, InvokeTarget, NodeExecutor } from "../types";
import {
    callEdgeMethod,
    type EdgePluginDefinition,
} from "../worker/define-edge-plugin";
import {
    type ExecutorRegistry,
    resolveEdgeTarget,
    splitPrompt,
} from "./edge-target";

/** A plugin definition, or an ESM namespace whose default export is one. */
export type EdgePluginModule =
    | EdgePluginDefinition
    | { default: EdgePluginDefinition };

export interface InProcessEdgeExecutorOptions {
    registry: ExecutorRegistry;
    /** Load a plugin's definition, e.g. `(id, cfg) => import(urlFor(id, cfg))`. Called once per plugin. */
    loadPlugin: (
        pluginId: string,
        plugin: PluginConfig,
    ) => EdgePluginModule | Promise<EdgePluginModule>;
}

function toDefinition(
    mod: EdgePluginModule,
    pluginId: string,
): EdgePluginDefinition {
    if ("methods" in mod && mod.methods) return mod;
    if ("default" in mod && mod.default?.methods) return mod.default;
    throw new Error(
        `Edge plugin ${pluginId} has no definition: export default defineEdgePlugin({ methods }).`,
    );
}

export function createInProcessEdgeExecutor(
    options: InProcessEdgeExecutorOptions,
): NodeExecutor {
    const loaded = new Map<string, Promise<EdgePluginDefinition>>();
    const load = (pluginId: string, plugin: PluginConfig) => {
        let p = loaded.get(pluginId);
        if (!p) {
            p = Promise.resolve(options.loadPlugin(pluginId, plugin)).then(
                (mod) => toDefinition(mod, pluginId),
            );
            p.catch(() => loaded.delete(pluginId));
            loaded.set(pluginId, p);
        }
        return p;
    };

    return {
        check(target: InvokeTarget) {
            resolveEdgeTarget(options.registry, target);
        },
        async invoke(req: InvokeRequest) {
            const { plugin, method } = resolveEdgeTarget(options.registry, req);
            const definition = await load(req.pluginId, plugin);
            const { input, params } = splitPrompt(req.prompt);
            const output = await callEdgeMethod(
                definition,
                {
                    method,
                    nodeSlot: req.nodeSlot,
                    input,
                    ...(req.model ? { model: req.model } : {}),
                    ...(params ? { params } : {}),
                },
                {
                    signal: req.signal,
                    progress: (message, percent) =>
                        req.onProgress({
                            kind: "progress",
                            message,
                            ...(percent !== undefined ? { percent } : {}),
                        }),
                    modelDownload: (p) =>
                        req.onProgress({ kind: "model-download", ...p }),
                },
            );
            return output as Record<string, unknown>;
        },
    };
}
