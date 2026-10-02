/**
 * Compose several small workflows into one big one — for a whole-picture
 * view on the canvas and one-shot re-runs.
 *
 * Small workflows link to each other by files: `shot/i2v.tongflow.json` has an
 * imageNode whose fileKey is `./keyframe.02.png`, which is an output of
 * `shot/keyframe.tongflow.json` in the same folder. Composition copies every
 * part onto one canvas and, wherever a data node references a file that
 * another part *produces*, replaces the static file by a real edge from that
 * part's producing executable node. Every stage's product stays an output
 * (a terminal "tap" data node), and `meta.outputLabels` names those outputs
 * after their part so a run of the composed workflow lands
 * `<all>.01.keyframe.png`, `<all>.01.i2v.mp4`, …. Labels are keyed both by the
 * exporter's output name (`output_<id8>`) and by the producing node's id,
 * because the engine reports outputs under either form.
 */
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
    type ExecutableWorkflow,
    isAbiNodeType,
    type PluginsRegistry,
    resolvedSpecForNodeType,
    resolveEdgeHandles,
} from "tongflow";
import type { WorkflowFileMeta } from "../shared/types.ts";
import { exists } from "../util/fsx.ts";
import { outputStem, parseOutputFileName } from "./outputs.ts";
import {
    fromProjectKey,
    keyDir,
    normalizeKey,
    toProjectKey,
    WORKFLOW_EXT,
} from "./paths.ts";
import { isDirRelative, isUrlLike } from "./refs.ts";
import {
    hydrateStore,
    normalizeWorkflowKey,
    readWorkflowFile,
    saveWorkflowFile,
    type WorkflowDocument,
} from "./workflow-file.ts";

type Node = ExecutableWorkflow["originalFlow"]["nodes"][number];
type Edge = ExecutableWorkflow["originalFlow"]["edges"][number];

export interface ComposePart {
    key: string;
    stem: string;
    doc: WorkflowDocument;
}

export interface ComposeResult {
    key: string;
    parts: string[];
    /** File references replaced by edges. */
    links: number;
    /** File references that stayed files (no producer among the parts, or the producer comes later). */
    unlinked: string[];
    nodeCount: number;
}

/** Suffix of the composed file when none is given. */
export const COMPOSED_SUFFIX = "_all";

/**
 * Every workflow under `folder`, at any depth, sorted by project key so the
 * order is stable and folders stay together; composed files are excluded at
 * every level.
 *
 * A parent composes the LEAVES beneath it, never its children's own composed
 * files: a part is linked to a producer by the file it references, and a
 * composed file's outputs are named after the composition (`a_all.01.x.png`),
 * not after the part that a sibling actually references (`a/x.02.png`). Taking
 * the leaves keeps every reference matchable, so the parent's graph is
 * connected the whole way down instead of silently reading stale files.
 */
export async function workflowsInFolder(
    projectRoot: string,
    folderKey: string,
): Promise<string[]> {
    const dir = fromProjectKey(projectRoot, normalizeKey(folderKey) || ".");
    if (!(await exists(dir))) return [];
    const out: string[] = [];
    const walk = async (at: string): Promise<void> => {
        for (const entry of await readdir(at, { withFileTypes: true })) {
            const full = join(at, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
                continue;
            }
            if (
                entry.name.endsWith(WORKFLOW_EXT) &&
                !basename(entry.name, WORKFLOW_EXT).endsWith(COMPOSED_SUFFIX)
            )
                out.push(toProjectKey(projectRoot, full));
        }
    };
    await walk(dir);
    return out.sort();
}

/** Resolve a data-node file reference of part `partKey` to a project key (URLs / absolute paths → undefined). */
function refToKey(partKey: string, value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const v = value.trim();
    if (isUrlLike(v) || v.startsWith("/")) return undefined;
    if (!isDirRelative(v)) return normalizeKey(v);
    const parts = keyDir(partKey) ? keyDir(partKey).split("/") : [];
    for (const seg of v.split("/")) {
        if (seg === "." || seg === "") continue;
        if (seg === "..") parts.pop();
        else parts.push(seg);
    }
    return parts.join("/");
}

/** Terminal executable nodes of a part whose ABI outputs include the wanted data node type. */
function producersFor(
    part: { nodes: Node[]; edges: Edge[] },
    dataNodeType: string,
): Node[] {
    const hasOut = new Set(part.edges.map((e) => e.source));
    return part.nodes.filter((n) => {
        const type = n.type ?? "";
        if (!isAbiNodeType(type) || hasOut.has(n.id)) return false;
        const spec = resolvedSpecForNodeType(type);
        return Boolean(
            spec?.topology.outputs.some((o) => o.nodeType === dataNodeType),
        );
    });
}

/**
 * Record a stage label under every key the engine might report the output as:
 * the exporter's `output_<id8>` for the output node, and the id (full and
 * short) of each node that actually produces the file.
 */
function labelOutput(
    labels: Record<string, string>,
    stem: string,
    outputNodeId: string,
    ...producerIds: string[]
): void {
    labels[`output_${outputNodeId.substring(0, 8)}`] = stem;
    for (const id of [outputNodeId, ...producerIds]) {
        labels[id] = stem;
        labels[id.substring(0, 8)] = stem;
    }
}

function edge(source: Node, target: Node): Edge {
    const h = resolveEdgeHandles({
        sourceType: source.type,
        targetType: target.type,
    });
    return {
        id: randomUUID(),
        source: source.id,
        target: target.id,
        type: "custom-edge",
        ...(h.sourceHandle ? { sourceHandle: h.sourceHandle } : {}),
        ...(h.targetHandle ? { targetHandle: h.targetHandle } : {}),
    } as Edge;
}

/** Data-node file references of a part, as project keys. */
function fileRefsOf(part: ComposePart): string[] {
    const out: string[] = [];
    for (const n of part.doc.flow.nodes) {
        if (isAbiNodeType(n.type ?? "")) continue;
        const data = (n.data ?? {}) as { fileKeys?: unknown };
        if (!Array.isArray(data.fileKeys)) continue;
        for (const k of data.fileKeys) {
            const key = refToKey(part.key, k);
            if (key) out.push(key);
        }
    }
    return out;
}

/**
 * Which part produces the file at `key`, if any. `key` arrives already
 * resolved to a project key by {@link refToKey}, so comparing it against each
 * part's own directory matches across folders as well as within one — a
 * workflow's outputs land beside it, wherever it lives.
 */
function producerIndex(parts: ComposePart[], key: string): number {
    const dir = keyDir(key);
    const file = key.slice(dir ? dir.length + 1 : 0);
    return parts.findIndex(
        (p) => keyDir(p.key) === dir && parseOutputFileName(p.stem, file),
    );
}

/**
 * Sort parts so producers come before consumers (a part that references
 * `./ref.01.png` follows `ref.tongflow.json`), keeping the given order as the
 * tie-break. Cycles fall back to the given order.
 */
function orderByDependencies(parts: ComposePart[]): void {
    const deps = parts.map((p) => {
        const set = new Set<number>();
        for (const key of fileRefsOf(p)) {
            const i = producerIndex(parts, key);
            if (i >= 0 && parts[i] !== p) set.add(i);
        }
        return set;
    });
    const done = new Set<number>();
    const order: number[] = [];
    let progress = true;
    while (order.length < parts.length && progress) {
        progress = false;
        for (let i = 0; i < parts.length; i++) {
            if (done.has(i)) continue;
            if ([...deps[i]].every((d) => done.has(d))) {
                done.add(i);
                order.push(i);
                progress = true;
            }
        }
    }
    if (order.length < parts.length) return; // cycle: keep the given order
    const sorted = order.map((i) => parts[i]);
    parts.splice(0, parts.length, ...sorted);
}

export interface ComposeOptions {
    /** Parts in production order (project keys, `.tongflow.json` optional). */
    workflows: string[];
    /** Where to write the composed workflow (defaults to `<dir of first part>/<dir name>_all`). */
    path?: string;
    name?: string;
    registry?: PluginsRegistry;
}

export async function composeWorkflows(
    projectRoot: string,
    options: ComposeOptions,
): Promise<ComposeResult> {
    const keys = options.workflows.map(normalizeWorkflowKey);
    if (keys.length < 2)
        throw new Error("compose needs at least two workflows");
    const parts: ComposePart[] = [];
    for (const key of keys) {
        const doc = await readWorkflowFile(projectRoot, key);
        if (doc.flow.nodes.length === 0) continue;
        parts.push({ key, stem: outputStem(key), doc });
    }
    if (parts.length < 2)
        throw new Error("fewer than two of the given workflows have nodes");
    orderByDependencies(parts);
    const outKey =
        options.path !== undefined
            ? normalizeWorkflowKey(options.path)
            : (() => {
                  const dir = keyDir(parts[0].key);
                  const name = `${basename(dir || "project")}${COMPOSED_SUFFIX}`;
                  return `${dir ? `${dir}/` : ""}${name}${WORKFLOW_EXT}`;
              })();
    if (keys.includes(outKey))
        throw new Error(`${outKey} is one of the parts — pick another path`);

    // 1. Copy every part with fresh ids, laid out left→right by part.
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const partNodes: { part: ComposePart; nodes: Node[]; edges: Edge[] }[] = [];
    let xOffset = 0;
    for (const part of parts) {
        const idMap = new Map<string, string>();
        const pnodes: Node[] = [];
        let width = 0;
        for (const n of part.doc.flow.nodes) {
            const id = randomUUID();
            idMap.set(n.id, id);
            width = Math.max(width, (n.position?.x ?? 0) + 520);
            pnodes.push({
                ...structuredClone(n),
                id,
                position: {
                    x: (n.position?.x ?? 0) + xOffset,
                    y: n.position?.y ?? 0,
                },
                selected: false,
            } as Node);
        }
        const pedges: Edge[] = part.doc.flow.edges
            .filter((e) => idMap.has(e.source) && idMap.has(e.target))
            .map(
                (e) =>
                    ({
                        ...structuredClone(e),
                        id: randomUUID(),
                        source: idMap.get(e.source)!,
                        target: idMap.get(e.target)!,
                    }) as Edge,
            );
        xOffset += width + 200;
        nodes.push(...pnodes);
        edges.push(...pedges);
        partNodes.push({ part, nodes: pnodes, edges: pedges });
    }

    // 2. Replace file references to other parts' outputs by edges.
    let links = 0;
    const unlinked: string[] = [];
    const outputLabels: Record<string, string> = {};
    const tapped = new Set<string>();
    const producerOf = (
        key: string,
    ): { pn: (typeof partNodes)[number]; index: number } | undefined => {
        const dir = keyDir(key);
        const file = key.slice(dir ? dir.length + 1 : 0);
        for (let i = 0; i < partNodes.length; i++) {
            const pn = partNodes[i];
            if (keyDir(pn.part.key) !== dir) continue;
            if (parseOutputFileName(pn.part.stem, file))
                return { pn, index: i };
        }
        return undefined;
    };
    for (let bi = 0; bi < partNodes.length; bi++) {
        const B = partNodes[bi];
        for (const dn of B.nodes) {
            const type = dn.type ?? "";
            if (isAbiNodeType(type) || !type.endsWith("Node")) continue;
            const data = (dn.data ?? {}) as { fileKeys?: unknown };
            const fileKeys = Array.isArray(data.fileKeys)
                ? (data.fileKeys as unknown[])
                : [];
            if (fileKeys.length === 0) continue;
            const remaining: unknown[] = [];
            let linkedAny = false;
            for (const raw of fileKeys) {
                const key = refToKey(B.part.key, raw);
                const producer = key ? producerOf(key) : undefined;
                if (!producer || producer.index >= bi) {
                    remaining.push(raw);
                    if (producer) unlinked.push(String(raw));
                    continue;
                }
                const execs = producersFor(producer.pn, type);
                if (execs.length === 0) {
                    remaining.push(raw);
                    unlinked.push(String(raw));
                    continue;
                }
                linkedAny = true;
                for (const n of execs) {
                    edges.push(edge(n, dn));
                    links++;
                    // Keep the producer's product an output of the whole: a terminal tap.
                    if (tapped.has(n.id)) continue;
                    tapped.add(n.id);
                    const tap: Node = {
                        id: randomUUID(),
                        type,
                        position: {
                            x: (n.position?.x ?? 0) + 560,
                            y: (n.position?.y ?? 0) + 260,
                        },
                        data: { label: producer.pn.part.stem },
                    } as Node;
                    nodes.push(tap);
                    edges.push(edge(n, tap));
                    labelOutput(
                        outputLabels,
                        producer.pn.part.stem,
                        tap.id,
                        n.id,
                    );
                }
            }
            if (linkedAny) {
                const nd = { ...(dn.data as Record<string, unknown>) };
                if (remaining.length > 0) nd.fileKeys = remaining;
                else delete nd.fileKeys;
                dn.data = nd as Node["data"];
            }
        }
    }

    // 3. Name the remaining terminal outputs after their part.
    const hasOut = new Set(edges.map((e) => e.source));
    for (const pn of partNodes) {
        for (const n of pn.nodes) {
            if (hasOut.has(n.id)) continue;
            const type = n.type ?? "";
            const isExec = isAbiNodeType(type);
            const isFedData =
                !isExec &&
                type.endsWith("Node") &&
                edges.some((e) => e.target === n.id);
            if (!isExec && !isFedData) continue;
            // A terminal data node is filled by the executable(s) feeding it;
            // the engine reports the product under those nodes' ids.
            const feeders = isExec
                ? [n.id]
                : edges.filter((e) => e.target === n.id).map((e) => e.source);
            labelOutput(outputLabels, pn.part.stem, n.id, ...feeders);
        }
    }

    // 4. Save.
    const name = options.name ?? `${basename(outKey, WORKFLOW_EXT)} (composed)`;
    const meta: WorkflowFileMeta = {
        purpose: `Composed from ${parts.length} workflows (${parts.map((p) => p.stem).join(" → ")}); edit here and re-run to regenerate the whole.`,
        outputLabels,
        composed: {
            parts: parts.map((p) => p.key),
            at: new Date().toISOString(),
        },
    };
    const store = hydrateStore({ name, flow: { nodes, edges }, meta });
    try {
        store.getState().autoLayout(undefined, { history: false });
    } catch {
        // layout is cosmetic
    }
    await saveWorkflowFile(projectRoot, outKey, store, {
        registry: options.registry,
        meta,
        name,
    });
    return {
        key: outKey,
        parts: parts.map((p) => p.key),
        links,
        unlinked,
        nodeCount: nodes.length,
    };
}
