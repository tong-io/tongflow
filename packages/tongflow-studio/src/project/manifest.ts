/** Project discovery, creation and `project.json` handling. */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectManifest, ProjectSummary } from "../shared/types.ts";
import { exists, isDir, nowIso, readJson, writeJson } from "../util/fsx.ts";
import {
    isProjectId,
    PROJECT_MANIFEST,
    projectIdFor,
    studioPaths,
    WORKFLOW_EXT,
} from "./paths.ts";

export class ProjectNotFoundError extends Error {
    constructor(readonly projectId: string) {
        super(`project "${projectId}" not found`);
        this.name = "ProjectNotFoundError";
    }
}

export interface ProjectRef {
    id: string;
    root: string;
    manifest: ProjectManifest;
}

export function projectRoot(studioRoot: string, projectId: string): string {
    if (!isProjectId(projectId))
        throw new Error(`invalid project id "${projectId}"`);
    return join(studioPaths(studioRoot).projects, projectId);
}

export async function loadProject(
    studioRoot: string,
    projectId: string,
): Promise<ProjectRef> {
    const root = projectRoot(studioRoot, projectId);
    const manifestPath = join(root, PROJECT_MANIFEST);
    if (!(await exists(manifestPath)))
        throw new ProjectNotFoundError(projectId);
    const manifest = await readJson<ProjectManifest>(manifestPath);
    return { id: projectId, root, manifest };
}

export async function saveManifest(
    root: string,
    manifest: ProjectManifest,
): Promise<void> {
    manifest.updatedAt = nowIso();
    await writeJson(join(root, PROJECT_MANIFEST), manifest);
}

export async function listProjects(
    studioRoot: string,
): Promise<ProjectSummary[]> {
    const dir = studioPaths(studioRoot).projects;
    if (!(await isDir(dir))) return [];
    const names = (await readdir(dir)).filter(isProjectId).sort();
    const out: ProjectSummary[] = [];
    for (const id of names) {
        try {
            const ref = await loadProject(studioRoot, id);
            out.push(await summarize(ref));
        } catch {
            // A half-created or foreign directory: skip silently.
        }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
}

export async function summarize(ref: ProjectRef): Promise<ProjectSummary> {
    let workflowCount = 0;
    let fileCount = 0;
    const walk = async (dir: string, depth: number): Promise<void> => {
        if (depth > 12) return;
        let entries: import("node:fs").Dirent[];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (e.name.startsWith(".")) continue;
            if (e.isDirectory()) await walk(join(dir, e.name), depth + 1);
            else {
                fileCount++;
                if (e.name.endsWith(WORKFLOW_EXT)) workflowCount++;
            }
        }
    };
    await walk(ref.root, 0);
    return { ...ref.manifest, root: ref.root, workflowCount, fileCount };
}

/** Pick a free project id derived from the title. */
export async function allocateProjectId(
    studioRoot: string,
    title: string,
    preferred?: string,
): Promise<string> {
    const base =
        preferred && isProjectId(preferred) ? preferred : projectIdFor(title);
    const projects = studioPaths(studioRoot).projects;
    await mkdir(projects, { recursive: true });
    if (!(await exists(join(projects, base)))) return base;
    for (let i = 2; i < 1000; i++) {
        const candidate = `${base}-${i}`;
        if (!(await exists(join(projects, candidate)))) return candidate;
    }
    throw new Error(`cannot allocate a project id for "${title}"`);
}

export interface CreateProjectInput {
    title: string;
    id?: string;
    brief?: string;
    locale?: string;
}

/**
 * Create an empty project: a folder with `project.json` and nothing else —
 * the agent designs the structure for what the user wants to make.
 */
export async function createProject(
    studioRoot: string,
    input: CreateProjectInput,
): Promise<ProjectRef> {
    const title = input.title.trim();
    if (!title) throw new Error("title is required");
    const id = await allocateProjectId(studioRoot, title, input.id);
    const root = projectRoot(studioRoot, id);
    await mkdir(root, { recursive: true });
    const at = nowIso();
    const manifest: ProjectManifest = {
        id,
        title,
        createdAt: at,
        updatedAt: at,
        ...(input.brief?.trim() ? { brief: input.brief.trim() } : {}),
        ...(input.locale?.trim() ? { locale: input.locale.trim() } : {}),
    };
    await writeJson(join(root, PROJECT_MANIFEST), manifest);
    return { id, root, manifest };
}
