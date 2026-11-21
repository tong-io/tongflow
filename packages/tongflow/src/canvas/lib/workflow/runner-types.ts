/**
 * The whole-workflow runner contract between the canvas and an engine
 * adapter. Framework free (no React, no stores) so an engine package can
 * implement it without importing the canvas; `runner.ts` re-exports it and
 * projects the events onto the canvas.
 */

import type { ExecutableWorkflow } from "../../../core/workflow/executable-workflow";
import type { AbiOutputView } from "../../../engine/output-view";

export type CanvasWorkflowRunEvent =
    | { type: "run-start" }
    | { type: "node-start"; nodeId: string }
    | {
          type: "node-progress";
          nodeId: string;
          /** Completed fraction in [0, 1]; absent = indeterminate. */
          fraction?: number;
          message?: string;
      }
    | {
          type: "node-download";
          nodeId: string;
          /** Bytes downloaded so far. */
          loaded: number;
          /** Total bytes, when known. */
          total?: number;
          /** What is being downloaded (model name, file …). */
          label: string;
      }
    | {
          type: "node-done";
          nodeId: string;
          /** `computeOutputView(node.outputs, result)` of the node's result. */
          outputView: AbiOutputView;
          /**
           * The raw plugin result, when the runner has it. Preferred over
           * `outputView` for routing because it keeps array-of-arrays
           * groups intact, exactly like a single-node task.
           */
          output?: Record<string, unknown>;
      }
    | { type: "node-error"; nodeId: string; message: string }
    | {
          /**
           * The node will not run (or stopped running): skipped by the user
           * or because of an upstream skip / failure. A later `node-start`
           * (a rerun un-skipped it) replaces the state.
           */
          type: "node-skipped";
          nodeId: string;
          /** The engine's reason, e.g. `"upstream failed"`. */
          reason?: string;
      }
    | { type: "run-paused" }
    | { type: "run-resumed" }
    | { type: "run-done"; ok: boolean; error?: string };

export interface CanvasWorkflowRunOptions {
    /** Aborted when the user stops the run. */
    signal: AbortSignal;
    /** Report progress; events after `signal` aborts are ignored. */
    onEvent: (event: CanvasWorkflowRunEvent) => void;
}

/** The implementation a node is switched to by `replaceImplementation`. */
export interface CanvasNodeImplementation {
    pluginId: string;
    model?: string;
}

/**
 * Live controls over the run in flight. Each call returns whether the runner
 * accepted it (`false` when idle or when the node's state does not allow
 * it). See docs/edge-runtime.md for the engine adapter's semantics.
 */
export interface CanvasWorkflowRunControls {
    /** No new node starts; running nodes finish. Emits `run-paused`. */
    pause(): boolean;
    /** Emits `run-resumed`. */
    resume(): boolean;
    /** Skip a node that has not started or is running, and its downstream. */
    skipNode(nodeId: string): boolean;
    /**
     * Run a node with another plugin of its slot: before it starts, or as a
     * rerun after it finished or failed (its stale downstream reruns too).
     */
    replaceImplementation(
        nodeId: string,
        impl: CanvasNodeImplementation,
    ): boolean;
}

/** What the canvas tells a runner about the graph on screen (see `handles`). */
export interface CanvasWorkflowGraph {
    /** The distinct plugin ids bound on the graph's nodes (sorted). */
    pluginIds: readonly string[];
}

export interface CanvasWorkflowRunner {
    /**
     * Run the whole workflow. Resolve when it ends (ideally after emitting
     * `run-done`); reject on a failure that has no `run-done` of its own.
     */
    run: (
        doc: ExecutableWorkflow,
        options: CanvasWorkflowRunOptions,
    ) => Promise<void>;
    /**
     * Optional live controls for the run in flight. When present the canvas
     * shows Pause / Resume next to Run / Stop and "Skip" / "Replace
     * implementation" in a node's menu while a run is in flight.
     */
    controls?: CanvasWorkflowRunControls;
    /**
     * Optional: whether this runner takes the graph on screen. The canvas
     * offers "Run workflow" only while it returns `true` (and keeps Stop
     * while a run is in flight), so a host whose other run path covers some
     * graphs leaves those to it. Absent = every graph. Called on every graph
     * change; keep it cheap.
     */
    handles?: (graph: CanvasWorkflowGraph) => boolean;
}
