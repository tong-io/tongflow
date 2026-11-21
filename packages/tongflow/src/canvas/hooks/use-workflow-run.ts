/**
 * Run the whole canvas workflow through the host's `CanvasWorkflowRunner`.
 *
 * `available` is false when the host configured no runner (the TongFlow app
 * and Studio today), in which case the canvas offers no "Run workflow"
 * action at all.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { exportWorkflow } from "../../core";
import { useCanvasWorkflowRunner } from "../host";
import { runCanvasWorkflow } from "../lib/workflow/runner";
import { useFlow } from "./use-flow";

export interface UseWorkflowRunReturn {
    /** The host provided a workflow runner. */
    available: boolean;
    /** A run started here has not settled yet. */
    running: boolean;
    /** Export the current graph and hand it to the runner. */
    run: () => Promise<void>;
    /** Abort the run in flight (no-op when idle). */
    stop: () => void;
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

    // Leaving the canvas stops its run.
    useEffect(() => () => controllerRef.current?.abort(), []);

    return { available: !!runner, running, run, stop };
}
