/**
 * `tongflow/engine/canvas` — runs the canvas's "Run workflow" action on the
 * TypeScript engine. {@link createEngineCanvasRunner} implements the canvas
 * `CanvasWorkflowRunner` contract (pass it as `CanvasHostConfig.workflowRunner`):
 * engine events become canvas events, and the engine's run controller is
 * exposed as the runner's `controls` so the canvas offers pause / resume,
 * skip and replace implementation. {@link createEngineTaskTransport} runs
 * single-node runs of the same nodes on the engine (pass it as
 * `CanvasHostConfig.taskTransport`). Platform neutral, no React: it only
 * shares the canvas's type contracts.
 */

import type {
    CanvasNodeImplementation,
    CanvasWorkflowRunControls,
    CanvasWorkflowRunEvent,
    CanvasWorkflowRunner,
} from "../../canvas/lib/workflow/runner-types";
import type { ExecutableWorkflow } from "../../core/workflow/executable-workflow";
import { computeOutputView } from "../output-view";
import { createRunController } from "../run-controller";
import { runWorkflow } from "../run-workflow";
import type {
    EngineEvent,
    RunController,
    RunResult,
    RunWorkflowOptions,
} from "../types";

export {
    type CanvasTaskTransport,
    createEngineTaskTransport,
    ENGINE_TASK_PREFIX,
    type EngineTaskTransportOptions,
    singleNodeWorkflow,
} from "./task-transport";

export type {
    CanvasNodeImplementation,
    CanvasWorkflowRunControls,
    CanvasWorkflowRunEvent,
    CanvasWorkflowRunner,
};

export interface EngineCanvasRunnerOptions
    extends Omit<RunWorkflowOptions, "signal" | "onEvent" | "controller"> {
    /**
     * Default `branch` here (a failed node only skips its own downstream),
     * unlike `runWorkflow`'s `abort`.
     */
    failurePolicy?: RunWorkflowOptions["failurePolicy"];
    /** Also receives every raw engine event, before it is mapped. */
    onEngineEvent?: (event: EngineEvent) => void;
    /** Called with each finished run's result. */
    onResult?: (result: RunResult) => void;
}

export interface EngineCanvasRunner extends CanvasWorkflowRunner {
    /** Forward to the run in flight; every call returns `false` when idle. */
    readonly controls: CanvasWorkflowRunControls;
    /** The engine controller of the run in flight, `null` when idle. */
    readonly controller: RunController | null;
}

/**
 * Map engine events of a run of `doc` to canvas events (`null` = no canvas
 * counterpart: `node_cancelled`, whose node either restarts, as a stale
 * rerun, or is cleared by `run-done`).
 */
export function createCanvasEventMapper(
    doc: Pick<ExecutableWorkflow, "executableNodes">,
): (event: EngineEvent) => CanvasWorkflowRunEvent | null {
    const routesOf = new Map(
        (doc.executableNodes ?? []).map((n) => [n.id, n.outputs ?? []]),
    );
    return (event) => {
        switch (event.type) {
            case "workflow_started":
                return { type: "run-start" };
            case "node_started":
                return { type: "node-start", nodeId: event.nodeId };
            case "plugin_progress":
                return {
                    type: "node-progress",
                    nodeId: event.nodeId,
                    ...(event.percent !== undefined
                        ? {
                              fraction: Math.min(
                                  1,
                                  Math.max(0, event.percent / 100),
                              ),
                          }
                        : {}),
                    message: event.message,
                };
            case "model_download":
                return {
                    type: "node-download",
                    nodeId: event.nodeId,
                    loaded: event.loaded,
                    ...(event.total !== undefined
                        ? { total: event.total }
                        : {}),
                    label:
                        [event.model, event.file].filter(Boolean).join(" · ") ||
                        event.pluginId,
                };
            case "node_completed":
                return {
                    type: "node-done",
                    nodeId: event.nodeId,
                    outputView: computeOutputView(
                        routesOf.get(event.nodeId) ?? [],
                        event.output,
                    ),
                    output: event.output,
                };
            case "node_failed":
                return {
                    type: "node-error",
                    nodeId: event.nodeId,
                    message: event.error,
                };
            case "node_skipped":
                return {
                    type: "node-skipped",
                    nodeId: event.nodeId,
                    reason: event.reason,
                };
            case "node_cancelled":
                return null;
            case "workflow_paused":
                return { type: "run-paused" };
            case "workflow_resumed":
                return { type: "run-resumed" };
            case "workflow_completed":
                // `partial` too: its failed / skipped nodes keep their own state.
                return { type: "run-done", ok: true };
            case "workflow_failed":
                return {
                    type: "run-done",
                    ok: false,
                    error: event.errors.join("\n") || "No node completed",
                };
            case "workflow_cancelled":
                return { type: "run-done", ok: false, error: "cancelled" };
        }
    };
}

/**
 * A canvas workflow runner over `runWorkflow`. One run at a time: `controls`
 * and `controller` address the run in flight.
 *
 * ```ts
 * const runner = createEngineCanvasRunner({
 *     executor: createCompositeExecutor({ registry, edge }),
 *     store: new OpfsAssetStore(),
 * });
 * <CanvasProvider workflowRunner={runner}>…</CanvasProvider>
 * ```
 */
export function createEngineCanvasRunner(
    options: EngineCanvasRunnerOptions,
): EngineCanvasRunner {
    const {
        onEngineEvent,
        onResult,
        failurePolicy = "branch",
        ...engineOptions
    } = options;
    let active: RunController | null = null;

    const controls: CanvasWorkflowRunControls = {
        pause: () => active?.pause() ?? false,
        resume: () => active?.resume() ?? false,
        skipNode: (nodeId) => active?.skipNode(nodeId) ?? false,
        replaceImplementation: (nodeId, impl) =>
            active?.replaceImplementation(nodeId, impl) ?? false,
    };

    return {
        controls,
        get controller() {
            return active;
        },
        async run(doc, { signal, onEvent }) {
            if (active) throw new Error("A workflow run is already in flight");
            const controller = createRunController();
            active = controller;
            const map = createCanvasEventMapper(doc);
            try {
                const result = await runWorkflow(doc, {
                    ...engineOptions,
                    failurePolicy,
                    signal,
                    controller,
                    onEvent: (event) => {
                        onEngineEvent?.(event);
                        const mapped = map(event);
                        if (mapped) onEvent(mapped);
                    },
                });
                onResult?.(result);
            } finally {
                if (active === controller) active = null;
            }
        },
    };
}
