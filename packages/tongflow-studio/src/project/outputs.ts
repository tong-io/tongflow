/**
 * Generated files live next to the workflow that made them:
 *
 *   characters/mei/mei_ref.tongflow.json     the workflow
 *   characters/mei/mei_ref.01.png            output of run #1
 *   characters/mei/mei_ref.02.png            run #2 (a run never overwrites)
 *   characters/mei/mei_ref.03.image.png      run #3 produced several outputs
 *   characters/mei/mei_ref.03.caption.txt      → the workflow output name is kept
 *   characters/mei/mei_ref.runs.json         provenance of every run
 *
 * The number is per workflow and shared by every file of one run.
 */
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { OutputInfo, OutputRecord } from "../shared/types.ts";
import { readJsonOr, writeJson } from "../util/fsx.ts";
import { fromProjectKey, keyDir, RUNS_SUFFIX, WORKFLOW_EXT } from "./paths.ts";

/** `characters/mei/mei_ref.tongflow.json` → `mei_ref`. */
export function outputStem(workflowKey: string): string {
    return basename(workflowKey, WORKFLOW_EXT);
}

export function runsLogKey(workflowKey: string): string {
    const dir = keyDir(workflowKey);
    return `${dir ? `${dir}/` : ""}${outputStem(workflowKey)}${RUNS_SUFFIX}`;
}

export function formatNo(no: number): string {
    return String(no).padStart(2, "0");
}

/** Sanitize a workflow output name for use inside a file name. */
export function safeOutputName(name: string): string {
    return (
        name.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "out"
    );
}

export function outputFileName(
    stem: string,
    no: number,
    ext: string,
    output?: string,
): string {
    const cleanExt = ext.replace(/^\./, "");
    return `${stem}.${formatNo(no)}${output ? `.${safeOutputName(output)}` : ""}.${cleanExt}`;
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse `<stem>.<no>[.<output>].<ext>`; undefined for anything else. */
export function parseOutputFileName(
    stem: string,
    fileName: string,
): { no: number; output?: string; ext: string } | undefined {
    const re = new RegExp(
        `^${escapeRe(stem)}\\.(\\d+)(?:\\.([A-Za-z0-9_-]+))?\\.([A-Za-z0-9]+)$`,
    );
    const m = re.exec(fileName);
    if (!m) return undefined;
    return {
        no: Number(m[1]),
        ...(m[2] ? { output: m[2] } : {}),
        ext: m[3].toLowerCase(),
    };
}

export async function readRunsLog(
    projectRoot: string,
    workflowKey: string,
): Promise<OutputRecord[]> {
    const abs = fromProjectKey(projectRoot, runsLogKey(workflowKey));
    const raw = await readJsonOr<unknown>(abs, []);
    return Array.isArray(raw) ? (raw as OutputRecord[]) : [];
}

export async function appendRunsLog(
    projectRoot: string,
    workflowKey: string,
    record: OutputRecord,
): Promise<void> {
    const records = await readRunsLog(projectRoot, workflowKey);
    records.push(record);
    await writeJson(
        fromProjectKey(projectRoot, runsLogKey(workflowKey)),
        records,
    );
}

/** Every generated file next to a workflow, oldest number first. */
export async function listOutputs(
    projectRoot: string,
    workflowKey: string,
): Promise<OutputInfo[]> {
    const stem = outputStem(workflowKey);
    const dirKey = keyDir(workflowKey);
    const dirAbs = fromProjectKey(projectRoot, dirKey || ".");
    let names: string[];
    try {
        names = await readdir(dirAbs);
    } catch {
        return [];
    }
    const records = await readRunsLog(projectRoot, workflowKey);
    const byNo = new Map(records.map((r) => [r.no, r]));
    const out: OutputInfo[] = [];
    for (const name of names) {
        const parsed = parseOutputFileName(stem, name);
        if (!parsed) continue;
        const st = await stat(join(dirAbs, name)).catch(() => undefined);
        if (!st?.isFile()) continue;
        const record = byNo.get(parsed.no);
        out.push({
            key: `${dirKey ? `${dirKey}/` : ""}${name}`,
            fileName: name,
            no: parsed.no,
            ...(parsed.output ? { output: parsed.output } : {}),
            ext: parsed.ext,
            size: st.size,
            mtime: st.mtime.toISOString(),
            workflow: workflowKey,
            ...(record ? { record } : {}),
        });
    }
    out.sort((a, b) => a.no - b.no || a.fileName.localeCompare(b.fileName));
    return out;
}

/** Next free output number: one above every numbered file and every logged run. */
export async function nextOutputNo(
    projectRoot: string,
    workflowKey: string,
): Promise<number> {
    const [files, records] = await Promise.all([
        listOutputs(projectRoot, workflowKey),
        readRunsLog(projectRoot, workflowKey),
    ]);
    let max = 0;
    for (const f of files) max = Math.max(max, f.no);
    for (const r of records) max = Math.max(max, r.no);
    return max + 1;
}
