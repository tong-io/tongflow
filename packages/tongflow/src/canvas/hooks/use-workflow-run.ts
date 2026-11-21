/**
 * Run the whole canvas workflow through the host's `CanvasWorkflowRunner`.
 *
 * `available` is false when the host configured no runner (the TongFlow app
 * and Studio without a browser plugin), or when the runner's `handles` turns
 * down the graph on screen (a host's edge runtime takes only graphs with a
 * browser-plugin node); the canvas then offers no "Run workflow" action at
 * all. A run in flight stays available, so Stop never disappears.
 * `controllable` is true when the runner also exposes live `controls`
 * (pause / resume, node skip / replace).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { exportWorkflow } from "../../core";
import { useCanvasWorkflowRunner } from "../host";
import {
    type CanvasWorkflowRunner,
    runCanvasWorkflow,
} from "../lib/workflow/runner";
import { type FlowState, useFlow } from "./use-flow";
import { usePluginsRegistryStore } from "./use-plugins-registry";
import { useTaskStore } from "./use-task";

/**
 * The distinct plugin ids bound on the graph's nodes, sorted and joined by
 * `\n` (a string, so the selector result is stable across renders).
 */
export function selectGraphPluginIds(state: Pick<FlowState, "nodes">): string {
    const ids = new Set<string>();
    for (const node of state.nodes) {
        const id = (node.data as { pluginId?: unknown } | undefined)?.pluginId;
        if (typeof id === "string" && id.trim()) ids.add(id.trim());
    }
    return [...ids].sort().join("\n");
}

/** Whether `runner` takes a graph whose {@link selectGraphPluginIds} is `pluginIdsKey`. */
export function runnerTakesGraph(
    runner: CanvasWorkflowRunner | undefined,
    pluginIdsKey: string,
): boolean {
    if (!runner) return false;
    if (!runner.handles) return true;
    return runner.handles({
        pluginIds: pluginIdsKey ? pluginIdsKey.split("\n") : [],
    });
}

export interface UseWorkflowRunReturn {
    /** The host's runner takes the graph on screen, or a run is in flight. */
    available: boolean;
    /** A run started here has not settled yet. */
    running: boolean;
    /** Export the current graph and hand it to the runner. */
    run: () => Promise<void>;
    /** Abort the run in flight (no-op when idle). */
    stop: () => void;
    /** The runner exposes live controls. */
    controllable: boolean;
    /** The run in flight is paused (it reported `run-paused`). */
    paused: boolean;
    /** Pause the run in flight (no-op when idle or not controllable). */
    pause: () => void;
    /** Resume a paused run. */
    resume: () => void;
}

export function useWorkflowRun(): UseWorkflowRunReturn {
    const runner = useCanvasWorkflowRunner();
    const [running, setRunning] = useState(false);
    const controllerRef = useRef<AbortController | null>(null);

    const run = useCallback(async () => {
        if (!runner || controllerRef.current) return;
        const { nodes, edges, workflowName, workflowDescription } =
            useFlow.getState();
        const doc = exportWorkflow(nodes, edges, {
            ...(workflowName ? { name: workflowName } : {}),
            ...(workflowDescription
                ? { description: workflowDescription }
                : {}),
            includeOriginalFlow: false,
        });
        const controller = new AbortController();
        controllerRef.current = controller;
        setRunning(true);
        try {
            await runCanvasWorkflow(runner, doc, controller.signal);
        } finally {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
            }
            setRunning(false);
        }
    }, [runner]);

    const stop = useCallback(() => {
        controllerRef.current?.abort();
    }, []);

    const pause = useCallback(() => {
        if (controllerRef.current) runner?.controls?.pause();
    }, [runner]);

    const resume = useCallback(() => {
        if (controllerRef.current) runner?.controls?.resume();
    }, [runner]);

    const workflowStatus = useTaskStore((s) => s.workflowExecutionStatus);
    const pluginIdsKey = useFlow(selectGraphPluginIds);
    // `handles` may read the registry (a plugin's runtime): re-evaluate when
    // it loads or changes.
    usePluginsRegistryStore((s) => s.registry);
    const handled = runnerTakesGraph(runner, pluginIdsKey);

    // Leaving the canvas stops its run.
    useEffect(() => () => controllerRef.current?.abort(), []);

    return {
        available: handled || running,
        running,
        run,
        stop,
        controllable: !!runner?.controls,
        paused: running && workflowStatus === "paused",
        pause,
        resume,
    };
}
