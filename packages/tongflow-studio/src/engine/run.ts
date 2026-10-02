/**
 * One workflow run against one project: bind inputs, resolve file references
 * and `{{file}}` includes, launch the engine, place outputs next to the
 * workflow, log provenance.
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ExecutableWorkflow } from "tongflow";
import type { ProjectRef } from "../project/manifest.ts";
import { RUNS_DIR, toProjectKey } from "../project/paths.ts";
import {
    baseDirOf,
    expandTemplate,
    hasTemplateRefs,
    resolveFileRef,
} from "../project/refs.ts";
import {
    readWorkflowFile,
    type WorkflowDocument,
    workflowHash,
} from "../project/workflow-file.ts";
import type {
    OutputInfo,
    OutputRecord,
    RunEvent,
    RunSummary,
} from "../shared/types.ts";
import type { Studio } from "../studio.ts";
import { nowIso } from "../util/fsx.ts";
import { ingestOutputs } from "./ingest.ts";
import type { EngineRequest, EngineResult } from "./runner.ts";
import { runEngine } from "./runner.ts";

export interface RunRequest {
    projectId: string;
    /** Project key of the workflow file (mutually exclusive with `document`). */
    workflowKey?: string;
    /** In-memory document (canvas single-node runs). */
    document?: WorkflowDocument;
    /** Input name → value: text, or file paths (relative to the workflow file or the project root), or URLs. */
    inputs?: Record<string, unknown>;
    /** Free-form note recorded in provenance. */
    note?: string;
    /** Display label (defaults to workflow name). */
    label?: string;
    /** Keep `.runs/<runId>` after ingest (default: removed when empty). */
    keepRunDir?: boolean;
}

export interface RunOutcome {
    summary: RunSummary;
    result: EngineResult;
    texts: Record<string, string[]>;
    loose: { output: string; key: string }[];
    /** Output number this run was given (0 for inline documents). */
    no: number;
}

type InputValue = { texts?: string[]; fileKeys?: string[] };

export async function executeRun(
    studio: Studio,
    project: ProjectRef,
    request: RunRequest,
    runId: string,
    signal: AbortSignal,
    emit: (event: RunEvent) => void,
    summary: RunSummary,
): Promise<RunOutcome> {
    const startedAt = nowIso();
    const started = Date.now();
    const doc =
        request.document ??
        (await readWorkflowFile(project.root, request.workflowKey!));
    if (!doc.executable) {
        throw new Error(
            `workflow "${request.workflowKey ?? doc.name}" has no executable graph${doc.exportError ? `: ${doc.exportError}` : " — save it once it validates"}`,
        );
    }
    const baseDir = baseDirOf(project.root, request.workflowKey);

    const workflow = structuredClone(doc.executable) as ExecutableWorkflow;
    const missingPlugins = workflow.executableNodes
        .filter((n) => !n.pluginId)
        .map((n) => `${n.label ?? n.id.slice(0, 8)} (${n.feature})`);
    if (missingPlugins.length > 0) {
        throw new Error(
            `no plugin selected for: ${missingPlugins.join(", ")} — install one with tongflow_plugins_install and re-save the workflow`,
        );
    }

    // 1. Bind inputs.
    const given: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(request.inputs ?? {})) {
        if (v === undefined || v === null) continue;
        given[k] = Array.isArray(v)
            ? v.map(String)
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
    }
    const inputs: Record<string, InputValue> = {};
    const missing: string[] = [];
    for (const spec of workflow.inputs) {
        const bound = given[spec.name];
        if (bound === undefined) {
            if (spec.required && spec.defaultValue === undefined)
                missing.push(`${spec.name} (${spec.type})`);
            continue;
        }
        inputs[spec.name] = await bindValue(
            project.root,
            baseDir,
            spec.type,
            bound,
        );
    }
    if (missing.length > 0) {
        throw new Error(
            `unbound required inputs: ${missing.join(", ")} — pass them via inputs (text, or file paths relative to the workflow / project root), or write the values into the workflow's nodes`,
        );
    }
    // 2. Resolve file references and {{file}} includes in static data / config.
    await resolveEmbeddedRefs(project.root, baseDir, workflow);

    // 3. Engine.
    const runDir = join(project.root, RUNS_DIR, runId);
    await mkdir(runDir, { recursive: true });
    const python = await studio.python(emitLog(emit));
    const engineRequest: EngineRequest = {
        workflow,
        inputs,
        options: {
            plugins_dir: studio.paths.plugins,
            data_dir: studio.paths.data,
            out_dir: runDir,
            ...(studio.abiPath ? { abi_path: studio.abiPath } : {}),
            file_key_base: project.root,
            inline_outputs: false,
            auto_install: true,
            org: studio.config.pluginOrg,
            plugin_git_urls: studio.config.pluginGitUrls,
            task_id: runId,
            env: await studio.pluginEnv(),
        },
    };
    const result = await runEngine({
        python,
        request: engineRequest,
        signal,
        cwd: project.root,
        onEvent: emit,
    });
    if (result.status !== "success") {
        const detail =
            result.errors.length > 0
                ? result.errors.join("; ")
                : "workflow failed";
        throw new Error(detail);
    }

    // 4. Place outputs next to the workflow.
    const finishedAt = nowIso();
    const record: Omit<OutputRecord, "no" | "files" | "texts"> = {
        runId,
        workflowHash: workflowHash(doc),
        inputs: given,
        pluginIds: [
            ...new Set(workflow.executableNodes.map((n) => n.pluginId)),
        ],
        startedAt,
        finishedAt,
        durationMs: Date.now() - started,
        ...(request.note ? { note: request.note } : {}),
    };
    const ingest = await ingestOutputs({
        projectRoot: project.root,
        result,
        ...(request.workflowKey ? { workflowKey: request.workflowKey } : {}),
        ...(doc.meta.outputLabels
            ? { outputLabels: doc.meta.outputLabels }
            : {}),
        record,
    });
    if (!request.keepRunDir && ingest.loose.length === 0) {
        await rm(runDir, { recursive: true, force: true }).catch(
            () => undefined,
        );
    }
    summary.files = ingest.files;
    emit({
        type: "ingested",
        at: nowIso(),
        files: ingest.files,
        outputs: result.outputs,
    });
    return {
        summary,
        result,
        texts: ingest.texts,
        loose: ingest.loose,
        no: ingest.no,
    };
}

function emitLog(emit: (e: RunEvent) => void): (line: string) => void {
    return (line) => emit({ type: "log", at: nowIso(), message: line });
}

/** Resolve one bound value into the engine's `{texts}` / `{fileKeys}` input form. */
async function bindValue(
    projectRoot: string,
    baseDir: string,
    type: string,
    bound: string | string[],
): Promise<InputValue> {
    const values = Array.isArray(bound) ? bound : [bound];
    const isText = type === "text" || type === "text[]";
    if (isText) {
        const texts: string[] = [];
        for (const v of values)
            texts.push(
                hasTemplateRefs(v)
                    ? await expandTemplate(projectRoot, baseDir, v)
                    : v,
            );
        return { texts };
    }
    const fileKeys: string[] = [];
    for (const v of values)
        fileKeys.push(await resolveFileRef(projectRoot, baseDir, v));
    return { fileKeys };
}

/** Replace file references inside static data nodes / static bindings with absolute paths, and expand `{{file}}` includes in texts. */
async function resolveEmbeddedRefs(
    projectRoot: string,
    baseDir: string,
    workflow: ExecutableWorkflow,
): Promise<void> {
    for (const dn of workflow.dataNodes) {
        const sd = dn.staticData;
        if (!sd) continue;
        if (sd.fileKeys?.length) {
            const out: string[] = [];
            for (const k of sd.fileKeys)
                out.push(await resolveFileRef(projectRoot, baseDir, k));
            sd.fileKeys = out;
        }
        if (sd.texts?.some(hasTemplateRefs)) {
            const out: string[] = [];
            for (const t of sd.texts)
                out.push(
                    hasTemplateRefs(t)
                        ? await expandTemplate(projectRoot, baseDir, t)
                        : t,
                );
            sd.texts = out;
        }
    }
    for (const node of workflow.executableNodes) {
        for (const binding of Object.values(node.bindings)) {
            if (binding.kind !== "static" && binding.kind !== "config")
                continue;
            if (hasTemplateRefs(binding.value)) {
                binding.value = await expandTemplate(
                    projectRoot,
                    baseDir,
                    binding.value,
                );
            }
        }
    }
}

export function newRunSummary(
    runId: string,
    projectId: string,
    workflow: string,
): RunSummary {
    return {
        runId,
        projectId,
        workflow,
        status: "queued",
        startedAt: nowIso(),
        files: [],
        nodes: {},
    };
}

export type { OutputInfo };
export { toProjectKey };
