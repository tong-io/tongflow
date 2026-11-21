/**
 * The browser edge runtime as a TongFlow host wires it into its canvas
 * (Studio, the Next app): one call builds
 *
 * - the executor: browser plugins in Web Workers (`createWorkerEdgeExecutor`,
 *   entry URL + `?modelBase=`), Python plugins through the host's remote
 *   executor, behind an optional consent gate (large model downloads);
 * - the canvas `workflowRunner` (`createEngineCanvasRunner`, `branch`
 *   failure policy) for "Run workflow";
 * - the canvas `taskTransport` for single-node runs: nodes bound to a
 *   browser plugin run as a one-node workflow on the same executor and
 *   store, every other node keeps the host's own transport.
 *
 * The registry object is read on every call, so a host may refresh
 * `registry.plugins` in place (after an install) without rebuilding.
 */

import type { CanvasTaskTransport } from "../../canvas/lib/task/transport-types";
import type { PluginConfig } from "../../core/registry/plugins-registry-schema";
import {
    createEngineCanvasRunner,
    createEngineTaskTransport,
    type EngineCanvasRunner,
} from "../canvas/index";
import { type ConsentGateOptions, createConsentGate } from "../consent-gate";
import { createCompositeExecutor } from "../executors/composite";
import {
    type ExecutorRegistry,
    pluginRuntimeOf,
} from "../executors/edge-target";
import type {
    AssetStore,
    EngineEvent,
    NodeExecutor,
    RemoteExecutor,
    RunResult,
} from "../types";
import { createWorkerEdgeExecutor } from "./worker-executor";

/** `entry` with `?modelBase=<absolute modelBase>`, the edge plugin contract for its model host. */
export function edgeEntryUrl(
    entry: string | URL,
    modelBase: string,
    origin: string,
): string {
    const url = new URL(String(entry), origin);
    url.searchParams.set("modelBase", new URL(modelBase, origin).href);
    return url.href;
}

/** One entry of a browser plugin's `models.json` (the fields read here). */
export interface EdgeModelInfo {
    id: string;
    approxMB?: number;
}

/**
 * A consent rule for large downloads: an edge node whose model (the node's
 * own, else its slot's default, the first `models` entry) is listed in its
 * plugin's `models.json` with `approxMB >= thresholdMB` asks once per model.
 */
export function largeModelConsent(options: {
    registry: ExecutorRegistry;
    /** Plugin id → its `models.json`. */
    models: Readonly<Record<string, readonly EdgeModelInfo[]>>;
    /** Default 200 MB. */
    thresholdMB?: number;
}): ConsentGateOptions["requires"] {
    const threshold = options.thresholdMB ?? 200;
    return ({ pluginId, nodeSlot, model }) => {
        if (pluginRuntimeOf(options.registry, pluginId) !== "browser")
            return undefined;
        const plugin = Object.hasOwn(options.registry.plugins, pluginId)
            ? options.registry.plugins[pluginId]
            : undefined;
        const id = model ?? plugin?.methodsByNodeSlot[nodeSlot]?.models?.[0];
        if (!id) return undefined;
        const info = options.models[pluginId]?.find((m) => m.id === id);
        if (!info?.approxMB || info.approxMB < threshold) return undefined;
        return {
            key: `${pluginId}:${id}`,
            label: `${id} (≈${Math.round(info.approxMB)} MB)`,
            approxMB: info.approxMB,
        };
    };
}

export interface EdgeHostRuntimeOptions {
    registry: ExecutorRegistry;
    /** Same-origin URL of a browser plugin's ESM entry, as the host serves it. */
    entryUrl: (pluginId: string, plugin: PluginConfig) => string | URL;
    /** Where plugins fetch model weights (`?modelBase=`); relative = against `origin`. */
    modelBase: string;
    /** Resolves relative URLs. Default `globalThis.location.origin`. */
    origin?: string;
    /** Runs `runtime: "python"` nodes on the host (`createHttpRemoteExecutor`). */
    remote?: RemoteExecutor;
    store: AssetStore;
    /** The host's own single-node transport, for every non-browser node. */
    fallbackTransport: CanvasTaskTransport;
    /** Ask before costly invocations (see {@link largeModelConsent}). */
    consent?: ConsentGateOptions;
    /** Replaces the Web Worker edge executor (tests, workerless hosts). */
    edge?: NodeExecutor;
    onEngineEvent?: (event: EngineEvent) => void;
    onResult?: (result: RunResult) => void;
}

export interface EdgeHostRuntime {
    runner: EngineCanvasRunner;
    taskTransport: CanvasTaskTransport;
    executor: NodeExecutor;
    /** Terminate the plugin workers. */
    dispose(): void;
}

export function createEdgeHostRuntime(
    options: EdgeHostRuntimeOptions,
): EdgeHostRuntime {
    const origin = options.origin ?? globalThis.location?.origin ?? "";
    const worker = options.edge
        ? undefined
        : createWorkerEdgeExecutor({
              registry: options.registry,
              resolveModuleUrl: (id, plugin) =>
                  edgeEntryUrl(
                      options.entryUrl(id, plugin),
                      options.modelBase,
                      origin,
                  ),
          });
    const edge = options.edge ?? worker;
    let executor: NodeExecutor = createCompositeExecutor({
        registry: options.registry,
        ...(edge ? { edge } : {}),
        ...(options.remote ? { remote: options.remote } : {}),
    });
    if (options.consent)
        executor = createConsentGate(options.consent).wrap(executor);
    const runner = createEngineCanvasRunner({
        executor,
        store: options.store,
        failurePolicy: "branch",
        ...(options.onEngineEvent
            ? { onEngineEvent: options.onEngineEvent }
            : {}),
        ...(options.onResult ? { onResult: options.onResult } : {}),
    });
    const taskTransport = createEngineTaskTransport({
        executor,
        store: options.store,
        fallback: options.fallbackTransport,
        handles: (r) =>
            pluginRuntimeOf(options.registry, r.pluginId) === "browser",
        ...(options.onEngineEvent
            ? { onEngineEvent: options.onEngineEvent }
            : {}),
    });
    return {
        runner,
        taskTransport,
        executor,
        dispose: () => worker?.dispose(),
    };
}
