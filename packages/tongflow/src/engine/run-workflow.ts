/**
 * The workflow scheduler, a port of `run_workflow` in
 * `sdk/tongflow/engine/runner.py`.
 *
 * 1. Seed data-node state from `staticData` (workflow inputs override).
 * 2. For each level of `executionLevels` (already topologically sorted), run
 *    its nodes: resolve params from bindings (fanning out over `batchField`)
 *    → materialize asset inputs → invoke the executor → store asset outputs →
 *    merge batch items → project the output view → refresh the downstream
 *    data nodes.
 * 3. Map the workflow outputs and return.
 *
 * Differences from Python, none of them visible in a successful run's result:
 * nodes of one level may run concurrently (`concurrency`), so their events
 * interleave; their state writes are still applied in level order once the
 * level settles. On a failure, siblings already running are cancelled
 * (`node_cancelled`) where Python would never have started them.
 */

import { ABI_NODES } from "../core/generated/abi/index";
import type {
    DataNode,
    ExecutableNode,
    ExecutableWorkflow,
} from "../core/workflow/executable-workflow";
import {
    convertAssetOutputsToFileRefs,
    materializeAssetInputs,
} from "./assets";
import { type DataNodeState, resolveNodeParamSets } from "./bindings";
import { type AbiOutputView, computeOutputView } from "./output-view";
import type {
    AbiSlotSchemas,
    EngineEvent,
    ExecutorProgress,
    NodeFailure,
    RunResult,
    RunWorkflowOptions,
    WorkflowInputValue,
} from "./types";

/** Input documents only need the fields the engine reads. */
export type RunnableWorkflow = Pick<
    ExecutableWorkflow,
    "executableNodes" | "dataNodes" | "executionLevels" | "outputs"
> &
    Partial<ExecutableWorkflow>;

/**
 * Merge the per-item outputs of a batch fan-out into one payload: each field
 * becomes the concatenation of the item values in batch order (lists are
 * extended, scalars appended); `success` / `error` are dropped (any failed
 * item already failed the node). Port of `_merge_batch_results`.
 */
export function mergeBatchResults(
    results: readonly Record<string, unknown>[],
): Record<string, unknown> {
    const merged: Record<string, unknown> = { success: true };
    for (const r of results) {
        for (const [k, v] of Object.entries(r)) {
            if (k === "success" || k === "error" || v == null) continue;
            let bucket = merged[k] as unknown[] | undefined;
            if (!bucket) {
                bucket = [];
                merged[k] = bucket;
            }
            if (Array.isArray(v)) bucket.push(...v);
            else bucket.push(v);
        }
    }
    return merged;
}

function inputToSlot(
    value: WorkflowInputValue,
    dataType: DataNode["dataType"] | undefined,
): { texts?: string[]; fileKeys?: string[] } {
    if (Array.isArray(value) || typeof value === "string") {
        const list = Array.isArray(value) ? value.map(String) : [value];
        return dataType === "text" ? { texts: list } : { fileKeys: list };
    }
    if (value && typeof value === "object") {
        const slot: { texts?: string[]; fileKeys?: string[] } = {};
        if (value.texts?.length) slot.texts = [...value.texts];
        if (value.fileKeys?.length) slot.fileKeys = [...value.fileKeys];
        return slot;
    }
    return {};
}

function seedDataNodeState(
    dataNodes: readonly DataNode[],
    inputs: Record<string, WorkflowInputValue | undefined>,
): DataNodeState {
    const state: DataNodeState = {};
    for (const dn of dataNodes) {
        let slot: { texts?: string[]; fileKeys?: string[] } = {};
        const supplied = dn.inputName ? inputs[dn.inputName] : undefined;
        if (dn.inputName && dn.inputName in inputs && supplied != null) {
            slot = inputToSlot(supplied, dn.dataType);
        }
        if (!slot.texts && !slot.fileKeys) {
            const stat = dn.staticData;
            if (stat?.texts?.length) slot.texts = stat.texts;
            if (stat?.fileKeys?.length) slot.fileKeys = stat.fileKeys;
        }
        if (slot.texts || slot.fileKeys) state[dn.id] = slot;
    }
    return state;
}

function mapWorkflowOutputs(
    doc: RunnableWorkflow,
    outputViews: Record<string, AbiOutputView>,
    dataNodeState: DataNodeState,
): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const spec of doc.outputs ?? []) {
        const { name, nodeId, field } = spec;
        if (
            typeof name !== "string" ||
            typeof nodeId !== "string" ||
            typeof field !== "string"
        ) {
            continue;
        }
        const view = outputViews[nodeId];
        if (view && field in view) {
            out[name] = [...view[field].values];
            continue;
        }
        const slot = dataNodeState[nodeId];
        if (!slot) continue;
        if (
            (field === "texts" || field === "fileKeys") &&
            slot[field]?.length
        ) {
            out[name] = [...(slot[field] ?? [])];
        } else if (slot.fileKeys?.length) {
            out[name] = [...slot.fileKeys];
        } else if (slot.texts?.length) {
            out[name] = [...slot.texts];
        }
    }
    return out;
}

/** Thrown inside a node when it stops because its run was aborted. */
class NodeCancelled extends Error {
    constructor() {
        super("cancelled");
        this.name = "NodeCancelled";
    }
}

/** Reject as soon as `signal` aborts, even if `promise` ignores the signal. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new NodeCancelled());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new NodeCancelled());
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (v) => {
                signal.removeEventListener("abort", onAbort);
                resolve(v);
            },
            (e) => {
                signal.removeEventListener("abort", onAbort);
                reject(e);
            },
        );
    });
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/**
 * How one node ended. What a failure means for the rest of the run is decided
 * in one place (`onNodeFailed`); today that is Python's rule, abort the run.
 */
type NodeOutcome =
    | { status: "completed"; result: Record<string, unknown> }
    | { status: "failed"; error: string }
    | { status: "cancelled" };

/** Run an exported workflow. Never throws for node failures; see {@link RunResult.status}. */
export async function runWorkflow(
    doc: RunnableWorkflow,
    options: RunWorkflowOptions,
): Promise<RunResult> {
    const { executor, store, signal } = options;
    const inputs: Record<string, WorkflowInputValue | undefined> =
        options.inputs ?? {};
    const abi: Readonly<Record<string, AbiSlotSchemas>> =
        options.abi ?? ABI_NODES;
    const concurrency = Math.max(
        1,
        options.concurrency ?? Number.POSITIVE_INFINITY,
    );
    const emit = (event: EngineEvent) => options.onEvent?.(event);

    const execNodes = doc.executableNodes ?? [];
    const nodesById = new Map(execNodes.map((n) => [n.id, n]));
    const dataNodes = doc.dataNodes ?? [];
    const levels = doc.executionLevels ?? [];

    const outputViews: Record<string, AbiOutputView> = {};
    const dataNodeState = seedDataNodeState(dataNodes, inputs);
    const nodeOutputs: Record<string, Record<string, unknown>> = {};
    const errors: string[] = [];
    const failures: NodeFailure[] = [];

    // Aborted by the caller's signal or by the run's first failure.
    const runAbort = new AbortController();
    const onCallerAbort = () => runAbort.abort();
    if (signal?.aborted) runAbort.abort();
    signal?.addEventListener("abort", onCallerAbort, { once: true });

    // Nodes that finished successfully; fewer than scheduled without a
    // failure means the caller cancelled the run.
    let completed = 0;
    const scheduled = levels.flat().filter((id) => nodesById.has(id)).length;

    /** Record a failure and apply the failure policy. Synchronous, so siblings failing in the same tick count as cancelled. */
    const onNodeFailed = (nodeId: string, label: string, error: string) => {
        errors.push(`Node ${nodeId} failed: ${error}`);
        failures.push({ nodeId, summary: error });
        emit({ type: "node_failed", nodeId, error, label });
        // Failure policy: the first failure aborts the run (Python semantics).
        runAbort.abort();
    };

    const executeNode = async (node: ExecutableNode): Promise<NodeOutcome> => {
        const nodeId = node.id;
        const label = node.label || node.feature || "";
        const slot = (node.feature ?? "").trim();
        const pluginId = (node.pluginId ?? "").trim();
        const model = (node.model ?? "").trim() || undefined;
        const advanced =
            node.params && Object.keys(node.params).length
                ? node.params
                : undefined;
        const nodeSignal = runAbort.signal;
        const onProgress = (p: ExecutorProgress) => {
            if (nodeSignal.aborted) return;
            if (p.kind === "model-download") {
                const { kind: _kind, ...rest } = p;
                emit({ type: "model_download", nodeId, pluginId, ...rest });
            } else {
                emit({
                    type: "plugin_progress",
                    nodeId,
                    pluginId,
                    message: p.message,
                    ...(p.percent !== undefined ? { percent: p.percent } : {}),
                });
            }
        };

        try {
            if (!pluginId) {
                throw new Error(
                    `Missing pluginId for nodeSlot=${slot}. Select a plugin in the node UI.`,
                );
            }
            if (!(slot in abi)) {
                throw new Error(
                    `Invalid nodeSlot=${slot}: not in ABI. Cannot execute workflow node.`,
                );
            }
            executor.check?.({ pluginId, nodeSlot: slot });

            const paramSets = resolveNodeParamSets(
                node,
                outputViews,
                dataNodeState,
                dataNodes,
                inputs,
            );
            const total = paramSets.length;
            const items: Record<string, unknown>[] = [];
            for (let i = 0; i < total; i++) {
                if (nodeSignal.aborted) throw new NodeCancelled();
                if (total > 1) {
                    emit({
                        type: "plugin_progress",
                        nodeId,
                        message: `batch ${i + 1}/${total}`,
                    });
                }
                const business = await raceAbort(
                    materializeAssetInputs(
                        slot,
                        paramSets[i],
                        abi,
                        store,
                        options.fetch,
                    ),
                    nodeSignal,
                );
                const prompt = advanced
                    ? { ...business, _params: advanced }
                    : business;
                const raw = await raceAbort(
                    executor.invoke({
                        pluginId,
                        nodeSlot: slot,
                        prompt,
                        ...(model ? { model } : {}),
                        signal: nodeSignal,
                        onProgress,
                    }),
                    nodeSignal,
                );
                const item = await raceAbort(
                    convertAssetOutputsToFileRefs(slot, raw, abi, store),
                    nodeSignal,
                );
                if (
                    typeof item !== "object" ||
                    item === null ||
                    Array.isArray(item)
                ) {
                    throw new Error("Plugin returned a non-object output");
                }
                const rec = item as Record<string, unknown>;
                if (rec.success === false) {
                    const suffix =
                        total > 1 ? ` (batch item ${i + 1}/${total})` : "";
                    throw new Error(
                        String(rec.error || "Plugin returned success=false") +
                            suffix,
                    );
                }
                items.push(rec);
            }
            const result = total === 1 ? items[0] : mergeBatchResults(items);
            return { status: "completed", result };
        } catch (e) {
            if (e instanceof NodeCancelled || nodeSignal.aborted) {
                return { status: "cancelled" };
            }
            const error = errorMessage(e);
            onNodeFailed(nodeId, label, error);
            return { status: "failed", error };
        }
    };

    /** Apply a completed node's output to the run state (Python's post-invoke block). */
    const commit = (node: ExecutableNode, result: Record<string, unknown>) => {
        nodeOutputs[node.id] = result;
        const routes = node.outputs ?? [];
        const view = computeOutputView(routes, result);
        outputViews[node.id] = view;
        for (const route of routes) {
            const target = route.downstreamDataNodeId;
            if (!target) continue;
            const channel = view[route.sourceField];
            if (!channel) continue;
            const slotState = dataNodeState[target] ?? {};
            if (route.dataField === "texts") slotState.texts = channel.values;
            else slotState.fileKeys = channel.values;
            dataNodeState[target] = slotState;
        }
    };

    /** Run one level, at most `concurrency` nodes at a time; commit in level order. */
    const runLevel = async (ids: readonly string[], levelIdx: number) => {
        const nodes = ids
            .map((id) => nodesById.get(id))
            .filter((n): n is ExecutableNode => n !== undefined);
        const outcomes: (NodeOutcome | undefined)[] = new Array(nodes.length);
        let next = 0;
        const lane = async () => {
            while (next < nodes.length && !runAbort.signal.aborted) {
                const idx = next++;
                const node = nodes[idx];
                const label = node.label || node.feature || "";
                emit({
                    type: "node_started",
                    nodeId: node.id,
                    level: levelIdx + 1,
                    feature: (node.feature ?? "").trim(),
                    label,
                });
                const outcome = await executeNode(node);
                outcomes[idx] = outcome;
                if (outcome.status === "completed") {
                    emit({
                        type: "node_completed",
                        nodeId: node.id,
                        output: outcome.result,
                        label,
                    });
                } else if (outcome.status === "cancelled") {
                    emit({ type: "node_cancelled", nodeId: node.id, label });
                }
            }
        };
        const lanes = Math.min(concurrency, nodes.length);
        await Promise.all(Array.from({ length: lanes }, lane));
        nodes.forEach((node, idx) => {
            const outcome = outcomes[idx];
            if (outcome?.status === "completed") {
                commit(node, outcome.result);
                completed++;
            }
        });
    };

    emit({
        type: "workflow_started",
        totalNodes: execNodes.length,
        levels: levels.length,
    });

    try {
        for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
            if (runAbort.signal.aborted) break;
            await runLevel(levels[levelIdx], levelIdx);
        }
    } finally {
        signal?.removeEventListener("abort", onCallerAbort);
    }

    const outputsByName = mapWorkflowOutputs(doc, outputViews, dataNodeState);
    const status =
        errors.length > 0
            ? "failed"
            : completed < scheduled
              ? "cancelled"
              : "success";
    emit({
        type:
            status === "success"
                ? "workflow_completed"
                : status === "failed"
                  ? "workflow_failed"
                  : "workflow_cancelled",
        status,
        outputs: nodeOutputs,
        errors,
    });
    return { status, outputs: nodeOutputs, outputsByName, errors, failures };
}
