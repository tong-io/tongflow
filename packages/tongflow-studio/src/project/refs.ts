/**
 * How workflows point at project files. No registry, no scheme — just paths:
 *
 *   ./mei_ref.02.png            relative to the workflow file's directory
 *   ../style/palette.png        (may climb, but never out of the project)
 *   characters/mei/mei.md       relative to the project root
 *   https://… / data:…          passed through untouched
 *
 * Inside any text (a prompt, a config field) `{{./file.md}}` is replaced by
 * that text file's content at run time, so a shared style note or a
 * character description is written once and included where needed.
 */
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { exists } from "../util/fsx.ts";
import { fromProjectKey, isInsideProject, toProjectKey } from "./paths.ts";

export function isUrlLike(value: string): boolean {
    return /^(https?:|data:|blob:)/i.test(value);
}

/** `./x` / `../x` are anchored at the workflow file; anything else at the project root. */
export function isDirRelative(value: string): boolean {
    return value.startsWith("./") || value.startsWith("../");
}

export class RefResolutionError extends Error {
    constructor(
        readonly ref: string,
        detail: string,
    ) {
        super(`cannot resolve "${ref}": ${detail}`);
        this.name = "RefResolutionError";
    }
}

/**
 * Resolve one file reference to an absolute path. `baseDir` is the absolute
 * directory of the workflow file (project root for inline documents).
 * Root-relative keys that do not exist are retried against `baseDir`, so a
 * hand-written `mei.png` next to the workflow still resolves.
 */
export async function resolveFileRef(
    projectRoot: string,
    baseDir: string,
    ref: string,
): Promise<string> {
    const value = ref.trim();
    if (!value) throw new RefResolutionError(ref, "empty");
    if (value.startsWith("tf://"))
        throw new RefResolutionError(
            ref,
            "tf:// references no longer exist — use a path relative to the workflow file (./name.png) or to the project root",
        );
    if (isUrlLike(value)) return value;
    if (isAbsolute(value)) return value;
    if (isDirRelative(value)) {
        const abs = resolve(baseDir, value);
        if (!isInsideProject(projectRoot, abs))
            throw new RefResolutionError(ref, "escapes the project");
        return abs;
    }
    const fromRoot = fromProjectKey(projectRoot, value);
    if (await exists(fromRoot)) return fromRoot;
    const fromBase = resolve(baseDir, value);
    if (isInsideProject(projectRoot, fromBase) && (await exists(fromBase)))
        return fromBase;
    return fromRoot;
}

/** Same as resolveFileRef but returns a project key (URLs / outside paths returned as-is). */
export async function toProjectKeyRef(
    projectRoot: string,
    baseDir: string,
    ref: string,
): Promise<string> {
    const abs = await resolveFileRef(projectRoot, baseDir, ref);
    if (isUrlLike(abs) || !isAbsolute(abs)) return abs;
    return isInsideProject(projectRoot, abs)
        ? toProjectKey(projectRoot, abs)
        : abs;
}

const TEMPLATE_RE = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;

/** True when a string embeds `{{path}}` placeholders. */
export function hasTemplateRefs(value: unknown): value is string {
    if (typeof value !== "string") return false;
    TEMPLATE_RE.lastIndex = 0;
    const hit = TEMPLATE_RE.test(value);
    TEMPLATE_RE.lastIndex = 0;
    return hit;
}

/** Placeholders found in a string (raw path text). */
export function templateRefsIn(value: string): string[] {
    return [...value.matchAll(TEMPLATE_RE)].map((m) => m[1]);
}

/**
 * Expand `{{path}}` placeholders with the (trimmed) content of those text
 * files. Missing files throw — a prompt silently losing its style block is
 * worse than a failed run.
 */
export async function expandTemplate(
    projectRoot: string,
    baseDir: string,
    text: string,
): Promise<string> {
    const matches = [...text.matchAll(TEMPLATE_RE)];
    if (matches.length === 0) return text;
    let out = "";
    let last = 0;
    for (const m of matches) {
        out += text.slice(last, m.index);
        const abs = await resolveFileRef(projectRoot, baseDir, m[1]);
        if (isUrlLike(abs))
            throw new RefResolutionError(m[1], "URLs cannot be inlined");
        let content: string;
        try {
            content = await readFile(abs, "utf8");
        } catch {
            throw new RefResolutionError(
                m[1],
                `no such text file (looked at ${abs})`,
            );
        }
        out += content.trim();
        last = (m.index ?? 0) + m[0].length;
    }
    return out + text.slice(last);
}

/** Absolute directory a workflow key's references are anchored at. */
export function baseDirOf(projectRoot: string, workflowKey?: string): string {
    return workflowKey
        ? dirname(fromProjectKey(projectRoot, workflowKey))
        : projectRoot;
}
