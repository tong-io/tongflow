/**
 * Where things live — the studio root and project-relative keys. A project
 * is a plain folder: the agent and the user shape its structure; the only
 * fixed names are `project.json` and the `.tongflow.json` workflow suffix.
 */
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Studio data root: the configured path, else `$TONGFLOW_STUDIO_ROOT`, else `~/.tongflow/studio`. */
export function resolveStudioRoot(configured?: string): string {
    const root = configured?.trim() || process.env.TONGFLOW_STUDIO_ROOT?.trim();
    return root ? resolve(root) : join(homedir(), ".tongflow", "studio");
}

export interface StudioPaths {
    root: string;
    projects: string;
    /** Bootstrap venv holding the `tongflow` SDK used to launch the engine. */
    venv: string;
    /** Engine `plugins_dir` (cloned TongFlow plugins). */
    plugins: string;
    /** Engine `data_dir` (shared plugin venv, caches). */
    data: string;
    tmp: string;
}

export function studioPaths(root: string): StudioPaths {
    return {
        root,
        projects: join(root, "projects"),
        venv: join(root, "venv"),
        plugins: join(root, "plugins"),
        data: join(root, "data"),
        tmp: join(root, "tmp"),
    };
}

export const PROJECT_MANIFEST = "project.json";
export const WORKFLOW_EXT = ".tongflow.json";
/** Sidecar next to a workflow listing every run that produced outputs. */
export const RUNS_SUFFIX = ".runs.json";
/** Scratch dir for engine outputs before they are placed next to their workflow. */
export const RUNS_DIR = ".runs";

const PROJECT_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isProjectId(id: string): boolean {
    return PROJECT_ID_RE.test(id);
}

/** kebab-case slug for a project id derived from its title. */
export function projectIdFor(title: string, fallback = "project"): string {
    const slug = title
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || fallback;
}

/** POSIX-style path relative to the project root (the file-key form used in workflows and URLs). */
export function toProjectKey(projectRoot: string, absPath: string): string {
    const rel = relative(projectRoot, absPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`path escapes the project: ${absPath}`);
    }
    return rel.split(sep).join("/");
}

/** Resolve a project-relative key to an absolute path, refusing escapes. */
export function fromProjectKey(projectRoot: string, key: string): string {
    const abs = resolve(projectRoot, key);
    const rel = relative(projectRoot, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`key escapes the project: ${key}`);
    }
    return abs;
}

export function isInsideProject(projectRoot: string, absPath: string): boolean {
    const rel = relative(projectRoot, absPath);
    return !(rel.startsWith("..") || isAbsolute(rel));
}

/** Directory part of a project key (`a/b/c.png` → `a/b`, `c.png` → ``). */
export function keyDir(key: string): string {
    const i = key.lastIndexOf("/");
    return i < 0 ? "" : key.slice(0, i);
}

/** Normalize a user/agent supplied path to a project key (POSIX separators, no leading `./`, no `..`). */
export function normalizeKey(input: string): string {
    const key = input
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.?\/+/, "")
        .replace(/\/+/g, "/")
        .replace(/\/$/, "");
    if (key.split("/").includes(".."))
        throw new Error(`invalid path "${input}"`);
    return key;
}
