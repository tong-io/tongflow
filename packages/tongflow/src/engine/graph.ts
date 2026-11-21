/**
 * Executable-to-executable dependencies of an exported workflow, for the
 * failure policy and the run controller: which executables a node reads
 * from, and the downstream closure a failure or a skip propagates to.
 *
 * An executable depends on another one when it binds the other's output
 * directly (`bindings[*].sources[].fromNodeId`), lists it in `dependencies`,
 * or depends on a data node the other one feeds (an output route's
 * `downstreamDataNodeId`, or a `dataNodeEdges` entry). Data-node chains are
 * followed.
 */

import type { ExecutableNode } from "../core/workflow/executable-workflow";
import type { RunnableWorkflow } from "./run-workflow";

export interface ExecutableGraph {
    /** Executable id → the executables it reads from. */
    upstream: ReadonlyMap<string, ReadonlySet<string>>;
    /** Executable id → the executables that read from it. */
    downstream: ReadonlyMap<string, ReadonlySet<string>>;
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
    for (const id of execIds) downstream.set(id, new Set());
    for (const node of execNodes) {
        const refs = new Set<string>(node.dependencies ?? []);
        for (const binding of Object.values(node.bindings ?? {})) {
            if (binding.kind !== "handle") continue;
            for (const s of binding.sources ?? []) refs.add(s.fromNodeId);
        }
        const ups = new Set<string>();
        for (const ref of refs) producers(ref, new Set(), ups);
        ups.delete(node.id);
        upstream.set(node.id, ups);
        for (const u of ups) downstream.get(u)?.add(node.id);
    }
    return { upstream, downstream };
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
