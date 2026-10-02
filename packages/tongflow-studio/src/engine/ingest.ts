/**
 * Place engine outputs next to the workflow that produced them: every file
 * becomes `<stem>.<no>[.<output>].<ext>` in the workflow's directory (one
 * number per run), text outputs are written as `.txt` files too, and one
 * record is appended to `<stem>.runs.json`.
 */
import { copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import {
    appendRunsLog,
    listOutputs,
    nextOutputNo,
    outputFileName,
    outputStem,
} from "../project/outputs.ts";
import {
    fromProjectKey,
    isInsideProject,
    keyDir,
    toProjectKey,
} from "../project/paths.ts";
import type { OutputInfo, OutputRecord } from "../shared/types.ts";
import type { EngineResult } from "./runner.ts";

export interface IngestOptions {
    projectRoot: string;
    result: EngineResult;
    /** Project key of the workflow file; undefined for inline (canvas) documents. */
    workflowKey?: string;
    /**
     * Label used in generated file names, keyed by whatever the engine reports
     * an output under: a declared workflow output name (`output_<id8>`) or —
     * when the engine only returns raw node outputs — the producing node's id.
     */
    outputLabels?: Record<string, string>;
    record: Omit<OutputRecord, "no" | "files" | "texts">;
}

export interface IngestOutcome {
    files: OutputInfo[];
    /** Files produced by an inline document (no workflow file): project keys. */
    loose: { output: string; key: string }[];
    texts: Record<string, string[]>;
    /** Output number assigned to this run (0 for inline documents). */
    no: number;
}

/** Collect `file_key` strings from a raw node output object (fallback when outputs_by_name is empty). */
function collectFileKeys(value: unknown, into: string[]): void {
    if (!value) return;
    if (typeof value === "string") return;
    if (Array.isArray(value)) {
        for (const v of value) collectFileKeys(v, into);
        return;
    }
    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        if (typeof obj.file_key === "string") {
            into.push(obj.file_key);
            return;
        }
        for (const v of Object.values(obj)) collectFileKeys(v, into);
    }
}

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A readable file-name tag: real output names (`image`, `caption`) are kept;
 * a raw node id is shortened to its first segment.
 */
function shortTag(output: string, all: Set<string>): string {
    if (!UUID_RE.test(output)) return output;
    const short = output.slice(0, 8);
    // Keep the full id if shortening would collide with another output.
    const collides = [...all].some(
        (o) => o !== output && o !== short && o.startsWith(short),
    );
    return collides ? output : short;
}

function looksLikeFile(value: string): boolean {
    return (
        /\.[A-Za-z0-9]{1,5}$/.test(value) &&
        !/\s/.test(value) &&
        (value.includes("/") || value.startsWith("."))
    );
}

export async function ingestOutputs(
    options: IngestOptions,
): Promise<IngestOutcome> {
    const { projectRoot, result, workflowKey } = options;
    const outcome: IngestOutcome = { files: [], loose: [], texts: {}, no: 0 };
    // The engine reports outputs either by workflow output name or (the usual
    // case) as raw per-node outputs keyed by node id; a composed workflow maps
    // both forms to a readable stage label.
    const label = (key: string): string => options.outputLabels?.[key] ?? key;
    const byName: Record<string, string[]> = {};
    for (const [name, values] of Object.entries(result.outputs_by_name ?? {})) {
        const l = label(name);
        if (!byName[l]) byName[l] = [];
        byName[l].push(...values);
    }
    if (Object.keys(byName).length === 0) {
        // Fall back to scanning raw node outputs for file refs.
        for (const [nodeId, out] of Object.entries(result.outputs ?? {})) {
            const keys: string[] = [];
            collectFileKeys(out, keys);
            if (keys.length === 0) continue;
            const l = label(nodeId);
            if (!byName[l]) byName[l] = [];
            byName[l].push(...keys);
        }
    }
    // Split file outputs from text outputs first so the file names can tell
    // whether a run produced one output or several.
    const fileOutputs: { output: string; abs: string }[] = [];
    for (const [output, values] of Object.entries(byName)) {
        for (const value of values) {
            const abs = isAbsolute(value) ? value : resolve(projectRoot, value);
            if (looksLikeFile(value) && isInsideProject(projectRoot, abs)) {
                fileOutputs.push({ output, abs });
            } else {
                if (!outcome.texts[output]) outcome.texts[output] = [];
                outcome.texts[output].push(value);
            }
        }
    }
    if (!workflowKey) {
        for (const f of fileOutputs)
            outcome.loose.push({
                output: f.output,
                key: toProjectKey(projectRoot, f.abs),
            });
        return outcome;
    }

    const stem = outputStem(workflowKey);
    const dirKey = keyDir(workflowKey);
    const dirAbs = fromProjectKey(projectRoot, dirKey || ".");
    await mkdir(dirAbs, { recursive: true });
    const no = await nextOutputNo(projectRoot, workflowKey);
    outcome.no = no;
    const outputNames = new Set([
        ...fileOutputs.map((f) => f.output),
        ...Object.keys(outcome.texts),
    ]);
    const several = outputNames.size > 1;
    // Several files under one output name (a batch) get an index suffix.
    const perOutput = new Map<string, number>();
    const written: string[] = [];
    const nameFor = (output: string, ext: string, count: number): string => {
        const idx = perOutput.get(output) ?? 0;
        perOutput.set(output, idx + 1);
        const parts: string[] = [];
        if (several) parts.push(shortTag(output, outputNames));
        if (count > 1) parts.push(String(idx + 1));
        return outputFileName(
            stem,
            no,
            ext,
            parts.length > 0 ? parts.join("_") : undefined,
        );
    };
    const countBy = new Map<string, number>();
    for (const f of fileOutputs)
        countBy.set(f.output, (countBy.get(f.output) ?? 0) + 1);
    for (const f of fileOutputs) {
        const ext = extname(f.abs).replace(/^\./, "") || "bin";
        const name = nameFor(f.output, ext, countBy.get(f.output) ?? 1);
        const dest = join(dirAbs, name);
        try {
            await rename(f.abs, dest);
        } catch {
            await copyFile(f.abs, dest);
        }
        written.push(name);
    }
    for (const [output, texts] of Object.entries(outcome.texts)) {
        const name = nameFor(output, "txt", 1);
        await writeFile(join(dirAbs, name), texts.join("\n\n"), "utf8");
        written.push(name);
    }
    const record: OutputRecord = {
        ...options.record,
        no,
        files: written,
        ...(Object.keys(outcome.texts).length > 0
            ? { texts: outcome.texts }
            : {}),
    };
    await appendRunsLog(projectRoot, workflowKey, record);
    const all = await listOutputs(projectRoot, workflowKey);
    outcome.files = all.filter((o) => o.no === no);
    return outcome;
}
