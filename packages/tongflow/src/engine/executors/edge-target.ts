/** Registry lookups shared by the edge executors (worker and in-process). */

import type {
    PluginConfig,
    PluginsRegistry,
} from "../../core/registry/plugins-registry-schema";
import type { InvokeTarget } from "../types";

/** The registry slice executors read. */
export type ExecutorRegistry = Pick<PluginsRegistry, "plugins">;

export const EDGE_PLUGIN_PREFIX = "tongflow-edge-";

/**
 * Where a plugin runs: `browser` by its registry `runtime`, or by the
 * `tongflow-edge-` prefix when it is not in the registry — the same rule as
 * the Python engine's `is_browser_plugin`.
 */
export function pluginRuntimeOf(
    registry: ExecutorRegistry,
    pluginId: string,
): "browser" | "python" {
    const cfg = Object.hasOwn(registry.plugins, pluginId)
        ? registry.plugins[pluginId]
        : undefined;
    if (cfg?.runtime === "browser") return "browser";
    if (!cfg && pluginId.startsWith(EDGE_PLUGIN_PREFIX)) return "browser";
    return "python";
}

export interface EdgeTarget {
    plugin: PluginConfig;
    method: string;
}

/** Resolve a browser plugin's config and slot method, or throw a clear error. */
export function resolveEdgeTarget(
    registry: ExecutorRegistry,
    { pluginId, nodeSlot }: InvokeTarget,
): EdgeTarget {
    const plugin = Object.hasOwn(registry.plugins, pluginId)
        ? registry.plugins[pluginId]
        : undefined;
    if (!plugin) {
        throw new Error(
            `Plugin ${pluginId} not found in the plugins registry.`,
        );
    }
    if (plugin.runtime !== "browser") {
        throw new Error(
            `Plugin ${pluginId} is not a browser plugin (runtime=${plugin.runtime ?? "python"}); the edge executor runs tongflow-edge-* plugins only.`,
        );
    }
    const method = plugin.methodsByNodeSlot[nodeSlot]?.methodName;
    if (!method) {
        throw new Error(
            `Plugin ${pluginId} does not implement nodeSlot=${nodeSlot}.`,
        );
    }
    return { plugin, method };
}

/** Split the engine's prompt into the ABI input and the reserved `_params`. */
export function splitPrompt(prompt: Record<string, unknown>): {
    input: Record<string, unknown>;
    params?: Record<string, unknown>;
} {
    const { _params, ...input } = prompt;
    if (_params && typeof _params === "object" && !Array.isArray(_params)) {
        return { input, params: _params as Record<string, unknown> };
    }
    return { input };
}
