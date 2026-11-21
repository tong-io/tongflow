/**
 * Run-whole-workflow entry.
 *
 * The canvas does not execute workflows itself. A host that can (for
 * example a browser engine) passes a `CanvasWorkflowRunner` as
 * `CanvasHostConfig.workflowRunner`; the canvas then shows a "Run workflow"
 * action, exports the current graph to an `ExecutableWorkflow`, hands it to
 * the runner and projects the runner's events onto the nodes.
 *
 * Events (all `nodeId`s are canvas node ids, i.e. `ExecutableNode.id`):
 *
 * | `type`          | Payload                                   | Canvas effect |
 * |-----------------|-------------------------------------------|---------------|
 * | `run-start`     | —                                         | clears previous node states, workflow status `running` |
 * | `node-start`    | `nodeId`                                  | node status `running` (spinner + timer) |
 * | `node-progress` | `nodeId`, `fraction?` (0..1), `message?`  | progress bar / status text on the node |
 * | `node-download` | `nodeId`, `loaded`, `total?` (bytes), `label` | model-download bar ("Downloading model 120/237 MB") |
 * | `node-done`     | `nodeId`, `outputView`, `output?`         | node status `completed`; results routed into downstream data nodes |
 * | `node-error`    | `nodeId`, `message`                       | node status `failed`; message shown on the node |
 * | `run-done`      | `ok`, `error?`                            | workflow status `completed` / `failed`; touched components tidied |
 */

import {
    type ExecutableWorkflow,
    getAbiNodeBySlot,
    logger,
    NODE_TYPE_TO_ABI_FEATURE,
    type PossibleNode,
    resolveAbiOutputMappings,
} from "../../../core";
import { useFlow } from "../../hooks/use-flow";
import { type NodeRunProgress, useTaskStore } from "../../hooks/use-task";
import {
    type AbiOutputView,
    applyResolvedOutputRoutes,
    normalizeTaskPayloadData,
} from "../task/payload";

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
    | { type: "run-done"; ok: boolean; error?: string };

export interface CanvasWorkflowRunOptions {
    /** Aborted when the user stops the run. */
    signal: AbortSignal;
    /** Report progress; events after `signal` aborts are ignored. */
    onEvent: (event: CanvasWorkflowRunEvent) => void;
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
}

/* ------------------------------------------------------------------ */
/* Output routing                                                      */
/* ------------------------------------------------------------------ */

/**
 * Same projection as `applyResolvedOutputRoutes`, from an already computed
 * output view: one downstream node per value for `x-expand-each` channels,
 * one node holding every value otherwise. (A view is flat, so an
 * array-of-arrays channel lands in one node.)
 */
export function applyOutputView(
    nodeId: string,
    view: AbiOutputView,
    expands: (nodeId: string | null, nodes: PossibleNode[]) => string[],
): void {
    for (const channel of Object.values(view)) {
        if (channel.values.length === 0) continue;
        if (channel.expandEach) {
            expands(
                nodeId,
                channel.values.map((value) => ({
                    type: channel.nodeType,
                    data: { [channel.dataField]: [value] },
                })),
            );
        } else {
            expands(nodeId, [
                {
                    type: channel.nodeType,
                    data: { [channel.dataField]: channel.values },
                },
            ]);
        }
    }
}

function featureOf(doc: ExecutableWorkflow, nodeId: string): string | null {
    const execNode = doc.executableNodes.find((n) => n.id === nodeId);
    if (execNode?.feature) return execNode.feature;
    const node = useFlow.getState().nodes.find((n) => n.id === nodeId);
    const data = node?.data as Record<string, unknown> | undefined;
    if (typeof data?.feature === "string") return data.feature;
    return node?.type ? (NODE_TYPE_TO_ABI_FEATURE[node.type] ?? null) : null;
}

/* ------------------------------------------------------------------ */
/* Event → canvas state                                                */
/* ------------------------------------------------------------------ */

/**
 * Returns a function that applies one runner event to the task store (node
 * status / progress, workflow status) and the flow store (results).
 */
export function createWorkflowRunEventApplier(
    doc: ExecutableWorkflow,
): (event: CanvasWorkflowRunEvent) => void {
    const touched = new Set<string>();
    const tasks = () => useTaskStore.getState();
    const patchProgress = (nodeId: string, next: NodeRunProgress | null) =>
        tasks().setNodeRunProgress(nodeId, next);

    return (event) => {
        switch (event.type) {
            case "run-start":
                touched.clear();
                tasks().clearNodeExecutionStatus();
                tasks().setWorkflowExecutionStatus("running");
                return;

            case "node-start":
                tasks().setNodeExecutionStatus(event.nodeId, "running");
                patchProgress(event.nodeId, null);
                return;

            case "node-progress":
                patchProgress(event.nodeId, {
                    ...(event.fraction !== undefined
                        ? { fraction: event.fraction }
                        : {}),
                    ...(event.message !== undefined
                        ? { message: event.message }
                        : {}),
                });
                return;

            case "node-download":
                patchProgress(event.nodeId, {
                    download: {
                        loaded: event.loaded,
                        ...(event.total !== undefined
                            ? { total: event.total }
                            : {}),
                        label: event.label,
                    },
                });
                return;

            case "node-done": {
                tasks().setNodeExecutionStatus(event.nodeId, "completed");
                patchProgress(event.nodeId, null);
                const feature = featureOf(doc, event.nodeId);
                const abiNode = feature ? getAbiNodeBySlot(feature) : undefined;
                if (!abiNode) {
                    logger.warn(
                        `[workflow-runner] No ABI slot for node ${event.nodeId}; results not routed`,
                    );
                    return;
                }
                const { expands } = useFlow.getState();
                const output = normalizeTaskPayloadData(event.output);
                if (output) {
                    const routes = resolveAbiOutputMappings(abiNode);
                    applyResolvedOutputRoutes(
                        event.nodeId,
                        output,
                        routes,
                        expands,
                    );
                } else {
                    applyOutputView(event.nodeId, event.outputView, expands);
                }
                touched.add(event.nodeId);
                return;
            }

            case "node-error":
                tasks().setNodeExecutionStatus(event.nodeId, "failed");
                patchProgress(event.nodeId, { error: event.message });
                return;

            case "run-done": {
                // Nodes the runner never finished must not keep spinning.
                const statuses = new Map(tasks().nodeExecutionStatusMap);
                let changed = false;
                for (const [id, status] of statuses) {
                    if (status === "running") {
                        statuses.delete(id);
                        changed = true;
                    }
                }
                if (changed) {
                    useTaskStore.setState({ nodeExecutionStatusMap: statuses });
                }
                tasks().setWorkflowExecutionStatus(
                    event.ok ? "completed" : "failed",
                );
                if (event.error) {
                    logger.error("[workflow-runner] Run failed:", event.error);
                }
                if (touched.size > 0) {
                    useFlow
                        .getState()
                        .autoLayout([...touched], { history: false });
                    touched.clear();
                }
                return;
            }
        }
    };
}

/**
 * Hand `doc` to `runner` and project its events onto the canvas until it
 * settles. Aborting `signal` resets the canvas to idle and drops later
 * events. A runner that resolves (or rejects) without `run-done` gets one
 * synthesized.
 */
export async function runCanvasWorkflow(
    runner: CanvasWorkflowRunner,
    doc: ExecutableWorkflow,
    signal: AbortSignal,
): Promise<void> {
    const apply = createWorkflowRunEventApplier(doc);
    let finished = false;
    const resetToIdle = () => {
        const store = useTaskStore.getState();
        store.clearNodeExecutionStatus();
        store.setWorkflowExecutionStatus("idle");
    };
    const onEvent = (event: CanvasWorkflowRunEvent) => {
        if (signal.aborted || finished) return;
        if (event.type === "run-done") finished = true;
        apply(event);
    };

    try {
        await runner.run(doc, { signal, onEvent });
        if (finished) return;
        if (signal.aborted) resetToIdle();
        else onEvent({ type: "run-done", ok: true });
    } catch (error) {
        if (finished) return;
        if (signal.aborted) {
            resetToIdle();
            return;
        }
        logger.error("[workflow-runner] Runner threw:", error);
        onEvent({
            type: "run-done",
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
