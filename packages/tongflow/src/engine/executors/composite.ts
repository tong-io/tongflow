/**
 * Route each node to the executor of its plugin's runtime: `browser` plugins
 * to the edge executor, `python` plugins to the remote executor. Mixed graphs
 * (some nodes in the browser, some on a TongFlow backend) run through one.
 */

import type {
    InvokeRequest,
    InvokeTarget,
    NodeExecutor,
    RemoteExecutor,
} from "../types";
import { type ExecutorRegistry, pluginRuntimeOf } from "./edge-target";

export interface CompositeExecutorOptions {
    registry: ExecutorRegistry;
    /** Runs `runtime: "browser"` plugins (worker or in-process edge executor). */
    edge?: NodeExecutor;
    /** Runs `runtime: "python"` plugins on a TongFlow backend. */
    remote?: RemoteExecutor;
}

export function createCompositeExecutor(
    options: CompositeExecutorOptions,
): NodeExecutor {
    const pick = ({ pluginId, nodeSlot }: InvokeTarget): NodeExecutor => {
        if (pluginRuntimeOf(options.registry, pluginId) === "browser") {
            if (!options.edge) {
                throw new Error(
                    `No edge executor configured: plugin ${pluginId} (nodeSlot=${nodeSlot}) is a browser plugin.`,
                );
            }
            return options.edge;
        }
        if (!options.remote) {
            throw new Error(
                `No remote executor configured: plugin ${pluginId} (nodeSlot=${nodeSlot}) runs in the Python runtime. ` +
                    "Configure a remote executor to run server-side nodes, or pick a browser (tongflow-edge-*) plugin.",
            );
        }
        return options.remote;
    };

    return {
        check(target: InvokeTarget) {
            pick(target).check?.(target);
        },
        invoke(req: InvokeRequest) {
            return pick(req).invoke(req);
        },
    };
}
