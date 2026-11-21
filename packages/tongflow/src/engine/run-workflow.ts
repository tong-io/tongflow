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
 *
 * TypeScript only for now (Python follows): the `branch` failure policy and
 * the {@link RunController} (pause / resume, skip, replace and rerun).
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
import { buildExecutableGraph, downstreamClosure } from "./graph";
import { type AbiOutputView, computeOutputView } from "./output-view";
import { attachRunController } from "./run-controller";
import {
    type AbiSlotSchemas,
    type EngineEvent,
    type ExecutorProgress,
    type FailurePolicy,
    type NodeFailure,
    type NodeImplementation,
    type NodeRunStatus,
    type NodeSkip,
    type RunResult,
    type RunStatus,
    type RunWorkflowOptions,
    SKIP_REASONS,
    type WorkflowInputValue,
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
    if (signal.aborted) {
        // Nobody reads the late result; keep its rejection handled.
        promise.catch(() => {});
        return Promise.reject(new NodeCancelled());
    }
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

function cloneState(state: DataNodeState): DataNodeState {
    const out: DataNodeState = {};
    for (const [id, slot] of Object.entries(state)) {
        out[id] = {
            ...(slot.texts ? { texts: [...slot.texts] } : {}),
            ...(slot.fileKeys ? { fileKeys: [...slot.fileKeys] } : {}),
        };
    }
    return out;
}

/**
 * How one execution of a node ended. A failure is applied (failure policy)
 * inside the execution itself, synchronously, so siblings failing in the
 * same tick under `abort` count as cancelled.
 */
type NodeOutcome =
    | { status: "completed"; result: Record<string, unknown> }
    /** `reported`: the failure was applied (false when the execution was already stale). */
    | { status: "failed"; error: string; reported: boolean }
    | { status: "cancelled" };

/** Scheduler state of one executable node. */
interface NodeRun {
    node: ExecutableNode;
    /** 0-based index into `executionLevels`. */
    level: number;
    /** Position in level order across the whole run. */
    order: number;
    status: NodeRunStatus;
    /** Set by `replaceImplementation`. */
    impl?: NodeImplementation;
    skipCause?: "user" | "upstream";
    skipReason?: string;
    /** The completed result, until committed into the run state. */
    result?: Record<string, unknown>;
    /** The result's outputs are applied to `outputViews` / data nodes. */
    committed: boolean;
    /** An execution is still unwinding (it may already be stale). */
    inFlight: boolean;
    abort: AbortController | null;
    /** Bumped whenever a skip or a rerun makes the execution in flight stale. */
    generation: number;
}

/**
 * Run an exported workflow. Never throws for node failures.
 *
 * Scheduling: a node starts only when every node of every earlier level has
 * settled (completed, failed or skipped); the nodes of one level run up to
 * `concurrency` at a time and their outputs are committed into the run state
 * in level order once the level settles. A rerun
 * (`RunController.replaceImplementation`) sends the scheduler back to the
 * rerun node's level.
 *
 * Final status, in this order:
 * 1. `failed` when a node failed under the `abort` policy;
 * 2. `cancelled` when the caller's signal aborted before every node settled;
 * 3. `success` when every scheduled node completed;
 * 4. `partial` when at least one completed (the others failed or were skipped);
 * 5. `failed` otherwise (nothing completed).
 */
export async function runWorkflow(
    doc: RunnableWorkflow,
    options: RunWorkflowOptions,
): Promise<RunResult> {
    const { executor, store, signal, controller } = options;
    const policy: FailurePolicy = options.failurePolicy ?? "abort";
    const inputs: Record<string, WorkflowInputValue | undefined> =
        options.inputs ?? {};
    const abi: Readonly<Record<string, AbiSlotSchemas>> =
        options.abi ?? ABI_NODES;
    const concurrency = Math.max(
        1,
        options.concurrency ?? Number.POSITIVE_INFINITY,
    );

    // Events raised while a handler runs (e.g. a controller call from
    // `onEvent`) are queued behind the current one, so handlers always see
    // events in the order the state changed.
    const queued: EngineEvent[] = [];
    let flushing = false;
    const onEvent = options.onEvent;
    const emit = (event: EngineEvent) => {
        if (!onEvent) return;
        queued.push(event);
        if (flushing) return;
        flushing = true;
        try {
            for (let e = queued.shift(); e; e = queued.shift()) onEvent(e);
        } finally {
            flushing = false;
        }
    };

    const execNodes = doc.executableNodes ?? [];
    const nodesById = new Map(execNodes.map((n) => [n.id, n]));
    const dataNodes = doc.dataNodes ?? [];
    const levels = doc.executionLevels ?? [];
    const graph = buildExecutableGraph(doc);

    const runs = new Map<string, NodeRun>();
    const levelRuns: NodeRun[][] = levels.map((ids, level) => {
        const out: NodeRun[] = [];
        for (const id of ids) {
            const node = nodesById.get(id);
            if (!node || runs.has(id)) continue;
            const run: NodeRun = {
                node,
                level,
                order: runs.size,
                status: "pending",
                committed: false,
                inFlight: false,
                abort: null,
                generation: 0,
            };
            runs.set(id, run);
            out.push(run);
        }
        return out;
    });
    const byOrder = (ids: Iterable<string>): NodeRun[] =>
        [...ids]
            .map((id) => runs.get(id))
            .filter((r): r is NodeRun => r !== undefined)
            .sort((a, b) => a.order - b.order);

    const outputViews: Record<string, AbiOutputView> = {};
    const seed = seedDataNodeState(dataNodes, inputs);
    const dataNodeState = cloneState(seed);
    const nodeOutputs: Record<string, Record<string, unknown>> = {};
    // Node id → error, in failure order (a rerun removes its entry).
    const failures = new Map<string, string>();

    // Aborted by the caller's signal or, under `abort`, by the first failure.
    const runAbort = new AbortController();
    const onCallerAbort = () => runAbort.abort();
    if (signal?.aborted) runAbort.abort();
    signal?.addEventListener("abort", onCallerAbort, { once: true });

    /* ---------- pause ------------------------------------------------ */

    let paused = false;
    let waiters: (() => void)[] = [];
    const wake = () => {
        const list = waiters;
        waiters = [];
        for (const w of list) w();
    };
    runAbort.signal.addEventListener("abort", wake, { once: true });
    const waitWhilePaused = async () => {
        while (paused && !runAbort.signal.aborted) {
            await new Promise<void>((resolve) => waiters.push(resolve));
        }
    };

    /* ---------- state transitions ------------------------------------ */

    const labelOf = (node: ExecutableNode) => node.label || node.feature || "";

    /** The node as it runs now: `replaceImplementation` swaps plugin / model. */
    const effectiveNode = (r: NodeRun): ExecutableNode => {
        if (!r.impl) return r.node;
        const samePlugin = r.impl.pluginId === r.node.pluginId;
        return {
            ...r.node,
            pluginId: r.impl.pluginId,
            model: r.impl.model,
            params: samePlugin ? r.node.params : undefined,
        };
    };

    /** Apply a completed node's output to the run state (Python's post-invoke block). */
    const commit = (r: NodeRun) => {
        const result = r.result;
        if (!result) return;
        const node = r.node;
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
        r.committed = true;
    };

    /** Undo {@link commit}: the node's data nodes go back to their seeded values. */
    const uncommit = (r: NodeRun) => {
        const id = r.node.id;
        delete nodeOutputs[id];
        delete outputViews[id];
        for (const route of r.node.outputs ?? []) {
            const target = route.downstreamDataNodeId;
            if (!target) continue;
            const seeded = seed[target];
            if (seeded) dataNodeState[target] = cloneState({ x: seeded }).x;
            else delete dataNodeState[target];
        }
        r.committed = false;
    };

    /** Make an execution in flight stale and stop it through its signal. */
    const interrupt = (r: NodeRun) => {
        r.generation++;
        r.abort?.abort();
    };

    /** Back to `pending` for a rerun: forget its result, failure and committed outputs. */
    const invalidate = (r: NodeRun) => {
        interrupt(r);
        r.status = "pending";
        r.skipCause = undefined;
        r.skipReason = undefined;
        failures.delete(r.node.id);
        if (r.committed) uncommit(r);
        r.result = undefined;
    };

    const markSkipped = (
        r: NodeRun,
        cause: "user" | "upstream",
        reason: string,
    ) => {
        if (r.status === "running" || r.inFlight) interrupt(r);
        r.status = "skipped";
        r.skipCause = cause;
        r.skipReason = reason;
        emit({
            type: "node_skipped",
            nodeId: r.node.id,
            reason,
            label: labelOf(r.node),
        });
    };

    /** Skip the not-yet-settled nodes of `id`'s downstream closure. */
    const skipClosure = (id: string, reason: string) => {
        for (const d of byOrder(downstreamClosure(graph, id))) {
            if (d.status === "pending" || d.status === "running") {
                markSkipped(d, "upstream", reason);
            }
        }
    };

    /** Record a failure and apply the failure policy. Ignores stale executions. */
    const nodeFailed = (
        r: NodeRun,
        generation: number,
        error: string,
    ): boolean => {
        if (r.generation !== generation) return false;
        const nodeId = r.node.id;
        r.status = "failed";
        failures.delete(nodeId);
        failures.set(nodeId, error);
        emit({ type: "node_failed", nodeId, error, label: labelOf(r.node) });
        if (policy === "abort") runAbort.abort();
        else skipClosure(nodeId, SKIP_REASONS.upstreamFailed);
        return true;
    };

    /* ---------- controller ------------------------------------------- */

    const skipNode = (nodeId: string): boolean => {
        const r = runs.get(nodeId);
        if (!r || runAbort.signal.aborted) return false;
        if (r.status !== "pending" && r.status !== "running") return false;
        markSkipped(r, "user", SKIP_REASONS.user);
        skipClosure(nodeId, SKIP_REASONS.upstreamSkipped);
        return true;
    };

    const replaceImplementation = (
        nodeId: string,
        impl: NodeImplementation,
    ): boolean => {
        const r = runs.get(nodeId);
        if (!r || runAbort.signal.aborted) return false;
        const next: NodeImplementation = {
            pluginId: impl.pluginId,
            ...(impl.model ? { model: impl.model } : {}),
        };
        if (r.status === "pending" && !r.inFlight) {
            r.impl = next;
            return true;
        }
        if (r.status !== "completed" && r.status !== "failed") return false;

        r.impl = next;
        invalidate(r);
        const closure = byOrder(downstreamClosure(graph, nodeId));
        const wasSkipped = new Set<NodeRun>();
        for (const d of closure) {
            if (d.status === "skipped") {
                // Un-skip what this node's failure or skip caused; a node the
                // user skipped stays skipped.
                if (d.skipCause !== "upstream") continue;
                wasSkipped.add(d);
                d.status = "pending";
                d.skipCause = undefined;
                d.skipReason = undefined;
            } else {
                invalidate(d);
            }
        }
        // Re-block, in level order, what another failed / skipped upstream
        // still blocks. Only a node that was not skipped before is reported.
        for (const d of closure) {
            if (d.status !== "pending") continue;
            let reason: string | undefined;
            for (const u of graph.upstream.get(d.node.id) ?? []) {
                const status = runs.get(u)?.status;
                if (status === "failed") reason = SKIP_REASONS.upstreamFailed;
                else if (status === "skipped") {
                    reason ??= SKIP_REASONS.upstreamSkipped;
                }
            }
            if (!reason) continue;
            if (wasSkipped.has(d)) {
                d.status = "skipped";
                d.skipCause = "upstream";
                d.skipReason = reason;
            } else {
                markSkipped(d, "upstream", reason);
            }
        }
        return true;
    };

    const detach = controller
        ? attachRunController(controller, {
              setPaused: (next) => {
                  if (paused === next || runAbort.signal.aborted) return;
                  paused = next;
                  emit({
                      type: next ? "workflow_paused" : "workflow_resumed",
                  });
                  if (!next) wake();
              },
              skipNode,
              replaceImplementation,
              nodeStatus: (nodeId) => runs.get(nodeId)?.status,
          })
        : undefined;

    /* ---------- execution -------------------------------------------- */

    const executeNode = async (
        r: NodeRun,
        node: ExecutableNode,
        generation: number,
        nodeSignal: AbortSignal,
    ): Promise<NodeOutcome> => {
        const nodeId = node.id;
        const slot = (node.feature ?? "").trim();
        const pluginId = (node.pluginId ?? "").trim();
        const model = (node.model ?? "").trim() || undefined;
        const advanced =
            node.params && Object.keys(node.params).length
                ? node.params
                : undefined;
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
            const reported = nodeFailed(r, generation, error);
            return { status: "failed", error, reported };
        }
    };

    /** One execution of `r`, from `node_started` to its outcome. */
    const runNode = async (r: NodeRun) => {
        const node = effectiveNode(r);
        const generation = r.generation;
        const nodeAbort = new AbortController();
        const forward = () => nodeAbort.abort();
        runAbort.signal.addEventListener("abort", forward, { once: true });
        r.status = "running";
        r.inFlight = true;
        r.abort = nodeAbort;
        const label = labelOf(node);
        emit({
            type: "node_started",
            nodeId: node.id,
            level: r.level + 1,
            feature: (node.feature ?? "").trim(),
            label,
        });
        let outcome: NodeOutcome;
        try {
            outcome = nodeAbort.signal.aborted
                ? { status: "cancelled" }
                : await executeNode(r, node, generation, nodeAbort.signal);
        } finally {
            runAbort.signal.removeEventListener("abort", forward);
            r.inFlight = false;
            r.abort = null;
        }
        if (r.generation !== generation) {
            // Skipped (already reported) or made stale by a rerun. A failure
            // was already reported too (a rerun requested from its
            // `node_failed` / `node_skipped` handlers lands here).
            if (
                (r.status as NodeRunStatus) === "pending" &&
                !(outcome.status === "failed" && outcome.reported)
            ) {
                emit({ type: "node_cancelled", nodeId: node.id, label });
            }
            return;
        }
        if (outcome.status === "completed") {
            r.status = "completed";
            r.result = outcome.result;
            r.committed = false;
            emit({
                type: "node_completed",
                nodeId: node.id,
                output: outcome.result,
                label,
            });
        } else if (outcome.status === "cancelled") {
            r.status = "cancelled";
            emit({ type: "node_cancelled", nodeId: node.id, label });
        }
    };

    /** True while a node of a level before `level` still has to run. */
    const unsettledBefore = (level: number) => {
        for (let i = 0; i < level; i++) {
            for (const r of levelRuns[i]) {
                if (r.status === "pending" || r.status === "running") {
                    return true;
                }
                if (r.inFlight) return true;
            }
        }
        return false;
    };

    /** Run the pending nodes of one level, at most `concurrency` at a time; commit in level order. */
    const runLevel = async (level: number) => {
        const nodes = levelRuns[level];
        const lane = async () => {
            for (;;) {
                if (paused) await waitWhilePaused();
                if (runAbort.signal.aborted) return;
                // A rerun of an earlier level goes first.
                if (unsettledBefore(level)) return;
                const next = nodes.find(
                    (r) => r.status === "pending" && !r.inFlight,
                );
                if (!next) return;
                await runNode(next);
            }
        };
        const lanes = Math.min(concurrency, nodes.length);
        await Promise.all(Array.from({ length: lanes }, lane));
        for (const r of nodes) {
            if (r.status === "completed" && !r.committed) commit(r);
        }
    };

    emit({
        type: "workflow_started",
        totalNodes: execNodes.length,
        levels: levels.length,
    });
    if (controller?.paused && !runAbort.signal.aborted) {
        paused = true;
        emit({ type: "workflow_paused" });
    }

    try {
        for (;;) {
            if (runAbort.signal.aborted) break;
            if (paused) {
                await waitWhilePaused();
                continue;
            }
            const level = levelRuns.findIndex((nodes) =>
                nodes.some((r) => r.status === "pending"),
            );
            if (level < 0) break;
            await runLevel(level);
        }
    } finally {
        signal?.removeEventListener("abort", onCallerAbort);
        detach?.();
    }

    const all = [...runs.values()];
    const completed = all.filter((r) => r.status === "completed").length;
    const unsettled = all.some(
        (r) => r.status === "pending" || r.status === "cancelled",
    );
    const status: RunStatus =
        policy === "abort" && failures.size > 0
            ? "failed"
            : runAbort.signal.aborted && unsettled
              ? "cancelled"
              : completed === all.length
                ? "success"
                : completed > 0
                  ? "partial"
                  : "failed";

    const errors = [...failures].map(
        ([nodeId, error]) => `Node ${nodeId} failed: ${error}`,
    );
    const failureList: NodeFailure[] = [...failures].map(
        ([nodeId, summary]) => ({ nodeId, summary }),
    );
    const skipped: NodeSkip[] = all
        .filter((r) => r.status === "skipped")
        .map((r) => ({
            nodeId: r.node.id,
            reason: r.skipReason ?? SKIP_REASONS.user,
        }));

    const outputsByName = mapWorkflowOutputs(doc, outputViews, dataNodeState);
    emit({
        type:
            status === "success" || status === "partial"
                ? "workflow_completed"
                : status === "failed"
                  ? "workflow_failed"
                  : "workflow_cancelled",
        status,
        outputs: nodeOutputs,
        errors,
    });
    return {
        status,
        outputs: nodeOutputs,
        outputsByName,
        errors,
        failures: failureList,
        skipped,
    };
}
