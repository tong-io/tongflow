/**
 * StudioApi — the one service layer both the agent tools and the HTTP routes
 * call. Everything is keyed by project id; the project directory on disk is
 * the source of truth (no in-memory canvas state).
 */
import {
    mkdir,
    readdir,
    readFile,
    stat,
    unlink,
    writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import {
    type ExecuteToolContext,
    executeGraphTool,
    type GraphPatch,
    KNOWN_NODE_TYPES,
    NODE_TYPE_TO_ABI_FEATURE,
    renderCanvas,
    resolvedSpecForNodeType,
    type ToolResult,
} from "tongflow";
import {
    categoryOf,
    NODE_CATEGORY_ORDER,
    type NodeCategory,
} from "./engine/node-categories.ts";
import type { RunRequest } from "./engine/run.ts";
import type { RunRecord } from "./engine/runs.ts";
import {
    type CanvasTaskBody,
    singleNodeDocument,
} from "./engine/single-node.ts";
import {
    COMPOSED_SUFFIX,
    type ComposeResult,
    composeWorkflows,
    workflowsInFolder,
} from "./project/compose.ts";
import {
    type CreateProjectInput,
    createProject,
    listProjects,
    loadProject,
    type ProjectRef,
    summarize,
} from "./project/manifest.ts";
import { listOutputs, readRunsLog, runsLogKey } from "./project/outputs.ts";
import {
    fromProjectKey,
    normalizeKey,
    RUNS_DIR,
    toProjectKey,
    WORKFLOW_EXT,
} from "./project/paths.ts";
import {
    canvasView,
    deleteWorkflowFile,
    hydrateStore,
    isWorkflowKey,
    listWorkflows,
    normalizeWorkflowKey,
    readWorkflowFile,
    saveWorkflowFile,
    summarizeWorkflow,
    type WorkflowDocument,
    workflowHash,
} from "./project/workflow-file.ts";
import type {
    OutputInfo,
    PluginBilling,
    PluginConfirmation,
    ProjectSummary,
    TreeNode,
    WorkflowFileMeta,
    WorkflowSummary,
} from "./shared/types.ts";
import { modalityOfExt } from "./shared/types.ts";
import type { Studio } from "./studio.ts";
import { exists, writeFileAtomic } from "./util/fsx.ts";

/** Where a folder's composed workflow lives: inside that folder, named after it. */
function composedKeyForFolder(folderKey: string): string {
    const dir = normalizeKey(folderKey);
    const name = `${basename(dir || "project")}${COMPOSED_SUFFIX}${WORKFLOW_EXT}`;
    return dir ? `${dir}/${name}` : name;
}

export class StudioApi {
    constructor(readonly studio: Studio) {}

    /* ---------------- projects ---------------- */

    listProjects(): Promise<ProjectSummary[]> {
        return listProjects(this.studio.paths.root);
    }

    async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
        const { id } = await createProject(this.studio.paths.root, {
            locale: this.studio.config.locale,
            ...input,
        });
        return summarize(await this.project(id));
    }

    project(projectId: string): Promise<ProjectRef> {
        return loadProject(this.studio.paths.root, projectId);
    }

    async projectSummary(projectId: string): Promise<ProjectSummary> {
        return summarize(await this.project(projectId));
    }

    /**
     * What exists: the folder tree (as indented text), every workflow with
     * its outputs, recent runs. This is what the agent reads first.
     */
    async status(projectId: string) {
        const ref = await this.project(projectId);
        const [summary, workflows, tree] = await Promise.all([
            summarize(ref),
            listWorkflows(ref.root),
            this.tree(projectId),
        ]);
        return {
            project: summary,
            tree: renderTree(tree),
            workflows: workflows.map((w) => ({
                key: w.key,
                name: w.name,
                ...(w.description ? { description: w.description } : {}),
                nodes: w.nodeCount,
                inputs: w.inputs,
                outputs: w.outputCount,
                lastNo: w.lastNo,
            })),
            runs: this.studio.runs.list(projectId).slice(0, 10),
        };
    }

    /* ---------------- workflows ---------------- */

    async listWorkflows(projectId: string): Promise<WorkflowSummary[]> {
        return listWorkflows((await this.project(projectId)).root);
    }

    async readWorkflow(
        projectId: string,
        key: string,
    ): Promise<WorkflowDocument> {
        return readWorkflowFile(
            (await this.project(projectId)).root,
            normalizeWorkflowKey(key),
        );
    }

    /** The document as the canvas should see it (references anchored at the project root). */
    async readWorkflowForCanvas(
        projectId: string,
        keyInput: string,
    ): Promise<WorkflowDocument> {
        const key = normalizeWorkflowKey(keyInput);
        return canvasView(await this.readWorkflow(projectId, key), key);
    }

    async workflowSummary(
        projectId: string,
        key: string,
    ): Promise<WorkflowSummary> {
        return summarizeWorkflow(
            (await this.project(projectId)).root,
            normalizeWorkflowKey(key),
        );
    }

    /** Create an empty workflow file, or copy another workflow — never overwrites. */
    async newWorkflow(
        projectId: string,
        keyInput: string,
        options: {
            copyFrom?: string;
            name?: string;
            description?: string;
            meta?: WorkflowFileMeta;
        } = {},
    ): Promise<WorkflowSummary> {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const abs = fromProjectKey(ref.root, key);
        if (await exists(abs))
            throw new Error(
                `${key} already exists — patch it, or pick another name`,
            );
        let doc: WorkflowDocument;
        if (options.copyFrom) {
            const src = await this.readWorkflow(projectId, options.copyFrom);
            doc = { ...src, meta: { ...src.meta, ...(options.meta ?? {}) } };
            if (options.name) doc.name = options.name;
            if (options.description !== undefined)
                doc.description = options.description;
        } else {
            doc = {
                name: options.name ?? basename(key, WORKFLOW_EXT),
                ...(options.description
                    ? { description: options.description }
                    : {}),
                flow: { nodes: [], edges: [] },
                meta: options.meta ?? {},
            };
        }
        const store = hydrateStore(doc);
        const registry = (await this.studio.registry.get()).registry;
        await saveWorkflowFile(ref.root, key, store, {
            registry,
            meta: doc.meta,
            name: doc.name,
            description: doc.description ?? "",
        });
        return summarizeWorkflow(ref.root, key);
    }

    /** Run one of the tongflow graph tools (apply_graph_patch / read_canvas / validate_workflow / describe_node_type) against a file. */
    async graphTool(
        projectId: string,
        keyInput: string,
        tool: string,
        args: Record<string, unknown>,
    ): Promise<ToolResult & { workflow?: string; rendered?: string }> {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const doc = await readWorkflowFile(ref.root, key);
        const store = hydrateStore(doc);
        const registry = (await this.studio.registry.get()).registry;
        const context: ExecuteToolContext = {
            registry,
            statusByNodeId: this.nodeStatuses(projectId, key),
        };
        const result = executeGraphTool(store, tool, args, context);
        if (tool === "apply_graph_patch") {
            await saveWorkflowFile(ref.root, key, store, {
                registry,
                meta: doc.meta,
            });
            const state = store.getState();
            return {
                ...result,
                workflow: key,
                rendered: renderCanvas(state.nodes, state.edges, {
                    maxText: 80,
                }),
            };
        }
        return { ...result, workflow: key };
    }

    async patchWorkflow(projectId: string, key: string, patch: GraphPatch) {
        return this.graphTool(
            projectId,
            key,
            "apply_graph_patch",
            patch as unknown as Record<string, unknown>,
        );
    }

    /** Full read: rendered canvas + inputs/outputs + generated files + validation. */
    async describeWorkflow(projectId: string, keyInput: string) {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const doc = await readWorkflowFile(ref.root, key);
        const store = hydrateStore(doc);
        const registry = (await this.studio.registry.get()).registry;
        const validation = executeGraphTool(
            store,
            "validate_workflow",
            {},
            { registry },
        );
        const [summary, outputs] = await Promise.all([
            summarizeWorkflow(ref.root, key),
            listOutputs(ref.root, key),
        ]);
        return {
            ok: true as const,
            workflow: key,
            name: doc.name,
            description: doc.description,
            canvas: renderCanvas(doc.flow.nodes, doc.flow.edges, {
                maxText: 200,
            }),
            inputs: summary.inputs,
            outputs: summary.outputs,
            meta: doc.meta,
            executable: Boolean(doc.executable),
            exportError: doc.exportError,
            validation,
            hash: workflowHash(doc),
            files: outputs.map((o) => ({
                key: o.key,
                no: o.no,
                ...(o.output ? { output: o.output } : {}),
                size: o.size,
                mtime: o.mtime,
                ...(o.record?.note ? { note: o.record.note } : {}),
            })),
        };
    }

    /**
     * Compose small workflows (explicit list, or every workflow directly in
     * a folder) into one big one; see project/compose.ts.
     */
    async composeWorkflows(
        projectId: string,
        options: {
            workflows?: string[];
            folder?: string;
            path?: string;
            name?: string;
        },
    ): Promise<ComposeResult> {
        const ref = await this.project(projectId);
        const workflows =
            options.workflows && options.workflows.length > 0
                ? options.workflows
                : options.folder !== undefined
                  ? await workflowsInFolder(ref.root, options.folder)
                  : [];
        if (workflows.length === 0)
            throw new Error(
                "nothing to compose — pass workflows: [...] or a folder that holds workflow files",
            );
        const registry = (await this.studio.registry.get()).registry;
        // Composing a folder writes into THAT folder. The generic fallback
        // uses the first part's directory, which for a recursive gather is
        // some leaf several levels down, not the folder that was asked for.
        const path =
            options.path ??
            (options.folder !== undefined
                ? composedKeyForFolder(options.folder)
                : undefined);
        return composeWorkflows(ref.root, {
            workflows,
            ...(path !== undefined ? { path } : {}),
            ...(options.name ? { name: options.name } : {}),
            registry,
        });
    }

    /** Generated files next to a workflow, with provenance. */
    async workflowOutputs(
        projectId: string,
        keyInput: string,
    ): Promise<OutputInfo[]> {
        const ref = await this.project(projectId);
        return listOutputs(ref.root, normalizeWorkflowKey(keyInput));
    }

    /** Save a document coming from the canvas (flow already edited client-side). */
    async saveWorkflowDocument(
        projectId: string,
        keyInput: string,
        doc: WorkflowDocument,
    ): Promise<WorkflowSummary> {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const store = hydrateStore(doc);
        const registry = (await this.studio.registry.get()).registry;
        await saveWorkflowFile(ref.root, key, store, {
            registry,
            meta: doc.meta,
            name: doc.name,
            description: doc.description ?? "",
        });
        return summarizeWorkflow(ref.root, key);
    }

    async deleteWorkflow(projectId: string, key: string): Promise<void> {
        await deleteWorkflowFile(
            (await this.project(projectId)).root,
            normalizeWorkflowKey(key),
        );
    }

    /* ---------------- billing checkpoint ---------------- */

    /** How a plugin is billed, from what the registry knows about it. */
    async pluginBilling(
        pluginId: string,
    ): Promise<{ billing: PluginBilling; note: string }> {
        const { registry, meta } = await this.studio.registry.get();
        const plugin = registry.plugins[pluginId] as
            | { needsDeploy?: boolean }
            | undefined;
        const env = meta[pluginId]?.env ?? [];
        if (plugin?.needsDeploy) {
            return {
                billing: "modal",
                note: "Runs on your Modal account: GPU time is billed per second while it runs (plus a cold start); the first run deploys the app, which can take minutes.",
            };
        }
        if (env.some((e) => e.required)) {
            return {
                billing: "api",
                note: `Calls a paid API with your own key (${env
                    .filter((e) => e.required)
                    .map((e) => e.key)
                    .join(", ")}); every run is billed by that provider.`,
            };
        }
        return {
            billing: "local",
            note: "Runs locally / free of charge as far as the studio knows.",
        };
    }

    /**
     * Paid plugins (API / Modal) a workflow run would use, with what the user
     * needs to know to say yes. Empty means the run is free and may start
     * without asking.
     */
    async paidPlugins(
        projectId: string,
        keyInput: string,
    ): Promise<PluginConfirmation[]> {
        const ref = await this.project(projectId);
        const key = normalizeWorkflowKey(keyInput);
        const doc = await readWorkflowFile(ref.root, key);
        const nodes = doc.executable?.executableNodes ?? [];
        const byPlugin = new Map<
            string,
            { slots: Set<string>; models: Set<string> }
        >();
        for (const n of nodes) {
            if (!n.pluginId) continue;
            const e = byPlugin.get(n.pluginId) ?? {
                slots: new Set<string>(),
                models: new Set<string>(),
            };
            e.slots.add(n.feature);
            if (n.model) e.models.add(n.model);
            byPlugin.set(n.pluginId, e);
        }
        if (byPlugin.size === 0) return [];
        const { registry, meta } = await this.studio.registry.get();
        const envNow = await this.studio.pluginEnv();
        const out: PluginConfirmation[] = [];
        for (const [pluginId, e] of byPlugin) {
            const { billing, note } = await this.pluginBilling(pluginId);
            if (billing === "local") continue;
            const plugin = registry.plugins[pluginId] as
                | {
                      name?: string;
                      methodsByNodeSlot?: Record<string, { models?: string[] }>;
                  }
                | undefined;
            const slots = [...e.slots];
            const availableModels = [
                ...new Set(
                    slots.flatMap(
                        (slot) =>
                            plugin?.methodsByNodeSlot?.[slot]?.models ?? [],
                    ),
                ),
            ];
            const alternatives: PluginConfirmation["alternatives"] = [];
            for (const [otherId, otherPlugin] of Object.entries(
                registry.plugins,
            )) {
                if (otherId === pluginId) continue;
                const shared = slots.filter(
                    (slot) =>
                        (
                            otherPlugin as {
                                methodsByNodeSlot?: Record<string, unknown>;
                            }
                        ).methodsByNodeSlot?.[slot],
                );
                if (shared.length === 0) continue;
                alternatives.push({
                    pluginId: otherId,
                    billing: (await this.pluginBilling(otherId)).billing,
                    slots: shared,
                });
            }
            out.push({
                pluginId,
                ...(plugin?.name ? { name: plugin.name } : {}),
                billing,
                billingNote: note,
                models: [...e.models],
                availableModels,
                env: (meta[pluginId]?.env ?? []).map((v) => ({
                    key: v.key,
                    required: Boolean(v.required),
                    set: Boolean(envNow[v.key] || process.env[v.key]),
                })),
                slots,
                alternatives,
            });
        }
        return out;
    }

    /* ---------------- runs ---------------- */

    async startRun(request: RunRequest): Promise<RunRecord> {
        const project = await this.project(request.projectId);
        const req: RunRequest = { ...request };
        if (req.workflowKey)
            req.workflowKey = normalizeWorkflowKey(req.workflowKey);
        return this.studio.runs.start(project, req);
    }

    /** Canvas single-node execution → a run of a one-node inline document. */
    async startCanvasRun(
        projectId: string,
        body: CanvasTaskBody,
    ): Promise<RunRecord> {
        const project = await this.project(projectId);
        const document = await singleNodeDocument(project.root, body);
        return this.studio.runs.start(project, {
            projectId,
            document,
            label: `canvas ${body.feature}`,
            keepRunDir: true,
        });
    }

    getRun(runId: string): RunRecord | undefined {
        return this.studio.runs.get(runId);
    }

    listRuns(projectId?: string) {
        return this.studio.runs.list(projectId);
    }

    /** nodeId → status for the given workflow, from the latest run touching it. */
    private nodeStatuses(
        projectId: string,
        key: string,
    ): Record<string, string> {
        const latest = this.studio.runs
            .list(projectId)
            .find((r) => r.workflow === key);
        if (!latest) return {};
        return Object.fromEntries(
            Object.entries(latest.nodes).map(([id, n]) => [id, n.status]),
        );
    }

    /* ---------------- plugins ---------------- */

    async registry() {
        return this.studio.registry.get();
    }

    async installPlugin(idOrUrl: string) {
        return this.studio.registry.install(idOrUrl);
    }

    async uninstallPlugin(id: string) {
        return this.studio.registry.uninstall(id);
    }

    async updatePlugins(ids?: string[]) {
        return this.studio.registry.update(ids);
    }

    /**
     * The node catalog the agent reads before writing a workflow: TongFlow's
     * grammar (six node categories, how edges and outputs work, batch vs
     * collect), then one line per node type grouped by category — ABI slot,
     * wires (with the data node each accepts), config fields, outputs, and
     * which installed plugins implement it. Everything per-type comes from
     * the ABI registry, so it cannot drift from what the exporter accepts.
     */
    async nodeCatalog(): Promise<string> {
        const { registry } = await this.studio.registry.get();
        const byCat = new Map<NodeCategory, string[]>();
        for (const c of NODE_CATEGORY_ORDER) byCat.set(c, []);
        const uncategorized: string[] = [];
        for (const type of KNOWN_NODE_TYPES) {
            const cat = categoryOf(type);
            const feature = NODE_TYPE_TO_ABI_FEATURE[type];
            let line: string;
            if (!feature) {
                line =
                    cat === "add"
                        ? `- ${type}: canvas input widget — do NOT use in agent-written workflows; use the ${type.replace(/^add/, "").replace(/^[A-Z]/, (m) => m.toLowerCase())} modality node with data instead`
                        : `- ${type}: carries ${type.replace(/Node$/, "")} (data: ${type === "textNode" || type === "linkNode" ? "{texts:[…]}" : "{fileKeys:[…]}"})`;
            } else {
                const spec = resolvedSpecForNodeType(type);
                if (!spec) continue;
                const wires: string[] = [];
                const config: string[] = [];
                for (const field of spec.topology.inputOrder) {
                    const f = spec.fields[field];
                    if (f.kind === "handle") {
                        const flag = f.batch
                            ? " batch"
                            : f.collect
                              ? " collect"
                              : f.array
                                ? "[]"
                                : "";
                        wires.push(
                            `${field}←${f.nodeType.replace(/Node$/, "")}${flag}${f.required ? "*" : ""}`,
                        );
                    } else config.push(`${field}${f.required ? "*" : ""}`);
                }
                const outs = spec.topology.outputs.map(
                    (o) => `${o.field}→${o.nodeType.replace(/Node$/, "")}`,
                );
                const plugins = registry.nodePluginMap[feature] ?? [];
                line = `- ${type} (${feature}): wires ${wires.join(", ") || "-"}; config ${config.join(", ") || "-"}; out ${outs.join(", ") || "-"}; plugins: ${plugins.length ? plugins.join(", ") : "NONE INSTALLED"}`;
            }
            if (cat) byCat.get(cat)!.push(line);
            else uncategorized.push(line);
        }
        const sections: string[] = [CATALOG_GRAMMAR.trim()];
        const titles: Record<NodeCategory, string> = {
            add: "add/ — canvas input widgets (not for agent workflows)",
            modality:
                "modality/ — data nodes, one asset each (what you wire INTO executables; also what executables emit)",
            transfer: "transfer/ — 1 → 1 executables",
            compose: "compose/ — N → 1 executables",
            decompose: "decompose/ — 1 → N executables",
            batch: "batch/ — N → 1 groupings",
        };
        for (const c of NODE_CATEGORY_ORDER) {
            const lines = byCat.get(c) ?? [];
            if (lines.length === 0) continue;
            sections.push(`## ${titles[c]}\n${lines.join("\n")}`);
        }
        if (uncategorized.length > 0)
            sections.push(`## other\n${uncategorized.join("\n")}`);
        return sections.join("\n\n");
    }

    /* ---------------- files & tree ---------------- */

    async readTextFile(projectId: string, key: string): Promise<string> {
        const ref = await this.project(projectId);
        return readFile(fromProjectKey(ref.root, normalizeKey(key)), "utf8");
    }

    async writeTextFile(
        projectId: string,
        key: string,
        text: string,
    ): Promise<void> {
        const ref = await this.project(projectId);
        await writeFileAtomic(
            fromProjectKey(ref.root, normalizeKey(key)),
            text,
        );
    }

    async deleteFile(projectId: string, key: string): Promise<void> {
        const ref = await this.project(projectId);
        await unlink(fromProjectKey(ref.root, normalizeKey(key)));
    }

    /**
     * Store a user-supplied file under `dirKey` (created as needed) without
     * overwriting: a clash gets a short suffix. Returns the project key.
     */
    async uploadFile(
        projectId: string,
        dirKey: string,
        fileName: string,
        data: Uint8Array,
    ): Promise<{ key: string; size: number }> {
        const ref = await this.project(projectId);
        const dir = fromProjectKey(ref.root, normalizeKey(dirKey) || ".");
        await mkdir(dir, { recursive: true });
        const safe =
            sanitizeFileName(basename(fileName || "upload")) || "upload";
        let dest = join(dir, safe);
        if (await exists(dest)) {
            const ext = safe.includes(".")
                ? safe.slice(safe.lastIndexOf("."))
                : "";
            const stem = safe.slice(0, safe.length - ext.length);
            let i = 2;
            while (await exists(join(dir, `${stem}-${i}${ext}`))) i++;
            dest = join(dir, `${stem}-${i}${ext}`);
        }
        await writeFile(dest, data);
        return { key: toProjectKey(ref.root, dest), size: data.byteLength };
    }

    async filePath(projectId: string, key: string): Promise<string> {
        const ref = await this.project(projectId);
        return fromProjectKey(ref.root, normalizeKey(key));
    }

    /**
     * The project folder as a tree. Generated files (`<stem>.NN…`) and the
     * runs log are nested under their workflow so the pane shows "workflow +
     * what it made" as one unit; everything else is listed as-is.
     */
    async tree(projectId: string): Promise<TreeNode[]> {
        const ref = await this.project(projectId);
        return this.dirTree(ref.root, ref.root, "");
    }

    private async dirTree(
        root: string,
        dir: string,
        prefix: string,
    ): Promise<TreeNode[]> {
        if (!(await exists(dir))) return [];
        const entries = (await readdir(dir, { withFileTypes: true })).filter(
            (e) => !e.name.startsWith(".") && e.name !== RUNS_DIR,
        );
        entries.sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory())
                return a.isDirectory() ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        const keyOf = (name: string) => (prefix ? `${prefix}/${name}` : name);
        // Outputs claimed by a workflow in this directory are hidden from the flat list.
        const claimed = new Set<string>();
        const workflowNodes = new Map<string, TreeNode>();
        for (const e of entries) {
            if (!e.isFile() || !isWorkflowKey(e.name)) continue;
            const key = keyOf(e.name);
            const outputs = await listOutputs(root, key);
            const logKey = runsLogKey(key);
            const children: TreeNode[] = outputs.map((o) => {
                claimed.add(o.fileName);
                return {
                    id: o.key,
                    label: o.fileName.slice(
                        basename(key, WORKFLOW_EXT).length + 1,
                    ),
                    kind: "output" as const,
                    key: o.key,
                    meta: {
                        size: o.size,
                        mtime: o.mtime,
                        modality: modalityOfExt(o.ext),
                        no: o.no,
                        ...(o.output ? { output: o.output } : {}),
                    },
                };
            });
            claimed.add(basename(logKey));
            const st = await stat(join(dir, e.name));
            workflowNodes.set(e.name, {
                id: key,
                label: e.name.slice(0, -WORKFLOW_EXT.length),
                kind: "workflow",
                key,
                meta: {
                    size: st.size,
                    mtime: st.mtime.toISOString(),
                    outputCount: outputs.length,
                },
                ...(children.length > 0 ? { children } : {}),
            });
        }
        const out: TreeNode[] = [];
        for (const e of entries) {
            const key = keyOf(e.name);
            if (e.isDirectory()) {
                out.push({
                    id: key,
                    label: e.name,
                    kind: "folder",
                    key,
                    children: await this.dirTree(root, join(dir, e.name), key),
                });
                continue;
            }
            const wf = workflowNodes.get(e.name);
            if (wf) {
                out.push(wf);
                continue;
            }
            if (claimed.has(e.name)) continue;
            const st = await stat(join(dir, e.name));
            out.push({
                id: key,
                label: e.name,
                kind: "file",
                key,
                meta: {
                    size: st.size,
                    mtime: st.mtime.toISOString(),
                    modality: modalityOfExt(e.name.split(".").pop() ?? ""),
                },
            });
        }
        return out;
    }

    /** Provenance log of a workflow (`<stem>.runs.json`). */
    async runsLog(projectId: string, keyInput: string) {
        const ref = await this.project(projectId);
        return readRunsLog(ref.root, normalizeWorkflowKey(keyInput));
    }

    toKey(projectRoot: string, abs: string): string {
        return toProjectKey(projectRoot, abs);
    }
}

/** Keep a user-supplied file name safe for the project folder: no control chars, no separators, no leading dots. */
function sanitizeFileName(name: string): string {
    const cleaned = [...name]
        .map((ch) =>
            ch.charCodeAt(0) < 32 || '/\\:*?"<>|'.includes(ch) ? "_" : ch,
        )
        .join("")
        .replace(/\s+/g, "_")
        .replace(/^\.+/, "");
    return cleaned;
}

/** The grammar preamble of the node catalog. */
const CATALOG_GRAMMAR = `
# TongFlow node grammar (follow it exactly — the patch tool rejects anything else)

A workflow is a graph of MODALITY data nodes and EXECUTABLE nodes.
- Modality nodes (textNode, imageNode, videoNode, audioNode, fileNode, modelNode, linkNode) carry one asset each: data:{texts:[…]} for text/link, data:{fileKeys:[…]} for the others (paths relative to the workflow file or the project root, or URLs). They are the ONLY things you wire into an executable.
- Executable nodes come in four categories (each maps to one ABI slot = one plugin method): transfer (1 → 1), compose (N → 1), decompose (1 → N), batch (N → 1 grouping). Pick the node whose slot matches the transformation; never fake a compose with a chain of transfers or vice versa.
- Each executable's "wires" are its input handles: field←modality (* = required). Draw an edge FROM a modality node (or an upstream executable's output) TO that field; handles are derived automatically, pass toHandle only to disambiguate. Its "config" fields are set in data:{…} at creation or by update_nodes. Its "out" lists the modality nodes it emits — those are created automatically when you save; wire the NEXT executable from the executable node itself (or its emitted modality node), never invent an output node.
- Batch semantics: a wire marked "batch" runs the executable once per upstream item (a textNode with 3 texts → 3 outputs); "collect" gathers every incoming edge into one array for a single run (e.g. images collect → one video); "[]" is an intrinsically array-typed input. Do not build loops by copying nodes — use batch.
- Level-0 modality nodes WITHOUT data become workflow inputs supplied at run time (name them with data:{inputName:'…'}); prefer writing the data in.
- Text you author goes into textNode data (or {{file}} includes) — genTextNode / textsGenTextNode are for mechanical transforms only.
- After every patch read the result: ok:false steps mean the grammar or ABI rejected it — fix, do not retry blindly. tongflow_node_describe(type) gives the full config schema (enums, ranges, defaults) of one node.
`;

/** Indented text view of the tree (what the agent reads in project_status). */
export function renderTree(nodes: TreeNode[], depth = 0): string {
    const lines: string[] = [];
    for (const n of nodes) {
        const pad = "  ".repeat(depth);
        if (n.kind === "folder") {
            lines.push(`${pad}${n.label}/`);
            if (n.children) lines.push(renderTree(n.children, depth + 1));
        } else if (n.kind === "workflow") {
            const count = n.meta?.outputCount ?? 0;
            lines.push(
                `${pad}${n.label}${WORKFLOW_EXT}  [workflow${count ? `, ${count} output file${count === 1 ? "" : "s"}` : ""}]`,
            );
            for (const c of n.children ?? [])
                lines.push(`${pad}  ${c.key.split("/").pop()}`);
        } else if (n.kind === "file") {
            lines.push(`${pad}${n.label}`);
        }
    }
    return lines.filter((l) => l.length > 0).join("\n");
}
