/** Shared helpers for the tongflow_* tools: project resolution, rendering, schemas. */
import type { StudioApi } from "../api.ts";
import { isInsideProject, isProjectId } from "../project/paths.ts";
import { getSessionProject, setSessionProject } from "../session-projects.ts";
import type { Studio } from "../studio.ts";
import type { Json, ToolCall } from "./spec.ts";

export interface ToolEnv {
    studio: Studio;
    api: StudioApi;
}

/**
 * Which project a call refers to: explicit `project` argument, else the
 * session's cwd when it lives under the studio projects dir, else the only
 * project, else an error listing the choices.
 */
export async function resolveProjectId(
    env: ToolEnv,
    call: ToolCall,
    explicit?: string,
): Promise<string> {
    const { sessionId } = call;
    const remember = (id: string) => {
        if (sessionId) setSessionProject(sessionId, id);
        return id;
    };
    if (explicit?.trim()) {
        const id = explicit.trim();
        if (!isProjectId(id)) throw new Error(`invalid project id "${id}"`);
        await env.api.project(id);
        return remember(id);
    }
    // The project this session already worked in.
    const memo = sessionId ? getSessionProject(sessionId) : undefined;
    if (memo) {
        try {
            await env.api.project(memo);
            return memo;
        } catch {
            // deleted meanwhile — fall through
        }
    }
    const { cwd } = call;
    if (cwd && isInsideProject(env.studio.paths.projects, cwd)) {
        const rel = cwd
            .slice(env.studio.paths.projects.length)
            .replace(/^[/\\]/, "");
        const id = rel.split(/[/\\]/)[0];
        if (id && isProjectId(id)) {
            try {
                await env.api.project(id);
                return remember(id);
            } catch {
                // fall through
            }
        }
    }
    const projects = await env.api.listProjects();
    if (projects.length === 1) return remember(projects[0].id);
    if (projects.length === 0) {
        throw new Error(
            "no studio project yet — create one with tongflow_project_create({ title, brief })",
        );
    }
    throw new Error(
        `several projects exist; pass project: one of ${projects.map((p) => p.id).join(", ")} (or open one with tongflow_project_open)`,
    );
}

/** Mark a project as the session's working project (project_create / project_open). */
export function rememberSessionProject(
    call: ToolCall,
    projectId: string,
): void {
    if (call.sessionId) setSessionProject(call.sessionId, projectId);
}

/** Trim big JSON so a tool result stays readable for the model, and brand it as plain JSON. */
export function compact(value: unknown): Json {
    return JSON.parse(
        JSON.stringify(value, (_k, v) => {
            if (typeof v === "string" && v.length > 4000)
                return `${v.slice(0, 4000)}… (${v.length} chars)`;
            return v;
        }) ?? "null",
    ) as Json;
}

export const PROJECT_PARAM = {
    type: "string",
    description:
        "Project id. Optional when the session is opened inside a project folder or only one project exists.",
} as const;

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
