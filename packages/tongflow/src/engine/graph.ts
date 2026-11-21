/**
 * Executable-to-executable dependencies of an exported workflow, for the
 * failure policy and the run controller: which executables a node reads
 * from, the downstream closure a failure or a skip propagates to, and the
 * per-input producers {@link blockingUpstreams} uses to decide whether a node
 * downstream of a failed or skipped one still runs.
 *
 * An executable depends on another one when it binds the other's output
 * directly (`bindings[*].sources[].fromNodeId`), lists it in `dependencies`,
 * or depends on a data node the other one feeds (an output route's
 * `downstreamDataNodeId`, or a `dataNodeEdges` entry). Data-node chains are
 * followed.
 */

import type { ExecutableNode } from "../core/workflow/executable-workflow";
import type { RunnableWorkflow } from "./run-workflow";

/**
 * How a bound handle input consumes its sources:
 *  - `collect`: an array-shaped binding (`consumerShape: "array"`, i.e. a
 *    `collectAll` sourceSpec or an ABI array input) that concatenates the
 *    values of all its sources;
 *  - `batch`: the node's `batchField` (fan-out over the collected values);
 *  - `single`: any other (scalar) input.
 */
export type InputShape = "collect" | "batch" | "single";

export interface InputDeps {
    field: string;
    shape: InputShape;
    /**
     * One entry per binding source: the executables feeding it. Empty for a
     * standalone data node (upload, manual text, workflow input), which never
     * fails.
     */
    sources: readonly ReadonlySet<string>[];
}

export interface ExecutableGraph {
    /** Executable id → the executables it reads from. */
    upstream: ReadonlyMap<string, ReadonlySet<string>>;
    /** Executable id → the executables that read from it. */
    downstream: ReadonlyMap<string, ReadonlySet<string>>;
    /** Executable id → its handle-bound inputs and their producers. */
    inputs: ReadonlyMap<string, readonly InputDeps[]>;
    /**
     * Executable id → the upstream executables it reaches only through
     * `dependencies` (no binding reads them): ordering-only dependencies.
     */
    orderOnly: ReadonlyMap<string, ReadonlySet<string>>;
}

export function buildExecutableGraph(doc: RunnableWorkflow): ExecutableGraph {
    const execNodes: readonly ExecutableNode[] = doc.executableNodes ?? [];
    const execIds = new Set(execNodes.map((n) => n.id));

    // Data node id → the nodes (executable or data) writing into it.
    const writers = new Map<string, Set<string>>();
    const addWriter = (target: string, source: string) => {
        if (execIds.has(target)) return;
        let set = writers.get(target);
        if (!set) {
            set = new Set();
            writers.set(target, set);
        }
        set.add(source);
    };
    for (const node of execNodes) {
        for (const route of node.outputs ?? []) {
            if (route.downstreamDataNodeId) {
                addWriter(route.downstreamDataNodeId, node.id);
            }
        }
    }
    for (const edge of doc.dataNodeEdges ?? []) {
        addWriter(edge.target, edge.source);
    }

    /** The executables feeding `id` (an executable is its own producer). */
    const producers = (id: string, seen: Set<string>, out: Set<string>) => {
        if (execIds.has(id)) {
            out.add(id);
            return;
        }
        if (seen.has(id)) return;
        seen.add(id);
        for (const w of writers.get(id) ?? []) producers(w, seen, out);
    };

    const upstream = new Map<string, Set<string>>();
    const downstream = new Map<string, Set<string>>();
    const inputs = new Map<string, InputDeps[]>();
    const orderOnly = new Map<string, Set<string>>();
    for (const id of execIds) downstream.set(id, new Set());
    for (const node of execNodes) {
        const fields: InputDeps[] = [];
        const bound = new Set<string>();
        for (const [field, binding] of Object.entries(node.bindings ?? {})) {
            if (binding.kind !== "handle") continue;
            const sources = (binding.sources ?? []).map((s) => {
                const out = new Set<string>();
                producers(s.fromNodeId, new Set(), out);
                out.delete(node.id);
                for (const p of out) bound.add(p);
                return out;
            });
            const shape: InputShape =
                field === node.batchField
                    ? "batch"
                    : binding.consumerShape === "array"
                      ? "collect"
                      : "single";
            fields.push({ field, shape, sources });
        }
        const viaDeps = new Set<string>();
        for (const ref of node.dependencies ?? []) {
            producers(ref, new Set(), viaDeps);
        }
        viaDeps.delete(node.id);
        const ups = new Set<string>([...bound, ...viaDeps]);
        upstream.set(node.id, ups);
        inputs.set(node.id, fields);
        orderOnly.set(
            node.id,
            new Set([...viaDeps].filter((u) => !bound.has(u))),
        );
        for (const u of ups) downstream.get(u)?.add(node.id);
    }
    return { upstream, downstream, inputs, orderOnly };
}

/**
 * The upstream executables that keep `id` from running, given which
 * executables are down (failed or skipped). Empty: the node runs. The rule
 * (branch policy and user skips):
 *
 *  - a `single` input is missing when any of its sources is down (all of a
 *    source's producers are down); the node is blocked when that input is
 *    required;
 *  - a `batch` input (the fan-out field) is missing the same way and always
 *    blocks: a fan-out never runs over a partial item list;
 *  - a `collect` input is missing only when every one of its sources is down
 *    (it would be empty); the node is blocked when that input is required.
 *    Otherwise it runs with the values the live sources produced;
 *  - an ordering-only dependency that is down always blocks.
 *
 * `required` is the slot's required input fields; `null` (no input schema
 * known) treats every input as required.
 */
export function blockingUpstreams(
    graph: ExecutableGraph,
    id: string,
    isDown: (id: string) => boolean,
    required: ReadonlySet<string> | null,
): string[] {
    const out = new Set<string>();
    const sourceDown = (s: ReadonlySet<string>) =>
        s.size > 0 && [...s].every(isDown);
    for (const input of graph.inputs.get(id) ?? []) {
        const down = input.sources.filter(sourceDown);
        if (down.length === 0) continue;
        const isRequired = required === null || required.has(input.field);
        const blocks =
            input.shape === "batch" ||
            (input.shape === "single" && isRequired) ||
            (input.shape === "collect" &&
                isRequired &&
                down.length === input.sources.length);
        if (!blocks) continue;
        for (const s of down) for (const p of s) out.add(p);
    }
    for (const u of graph.orderOnly.get(id) ?? []) if (isDown(u)) out.add(u);
    return [...out];
}

/** Every executable reachable downstream of `id` (excluding `id`). */
export function downstreamClosure(
    graph: ExecutableGraph,
    id: string,
): Set<string> {
    const out = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
        const cur = queue.shift() as string;
        for (const d of graph.downstream.get(cur) ?? []) {
            if (d === id || out.has(d)) continue;
            out.add(d);
            queue.push(d);
        }
    }
    return out;
}
