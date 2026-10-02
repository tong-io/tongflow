/** Project tools: create / open / list / status. Structure inside a project is made with the ordinary file tools. */

import { type ToolSpec, tool } from "./spec.ts";
import {
    compact,
    PROJECT_PARAM,
    rememberSessionProject,
    resolveProjectId,
    type ToolEnv,
} from "./support.ts";

export function projectTools(env: ToolEnv): ToolSpec[] {
    const { api } = env;
    return [
        tool({
            name: "tongflow_project_create",
            description:
                "Create a new, empty studio project (a folder with project.json). Returns its id and root path. There is no template: design the folder structure for what the user wants to make, and write it with the file tools. " +
                "Ask the user to open the project (or call tongflow_project_open) so the session's working directory is the project folder.",
            parameters: {
                title: {
                    type: "string",
                    required: true,
                    description: "Human title of the project.",
                },
                brief: {
                    type: "string",
                    description:
                        "What the user wants to make, in their words (stored in project.json for later sessions).",
                },
                id: {
                    type: "string",
                    description:
                        "Preferred kebab-case project id (derived from the title when omitted).",
                },
                locale: {
                    type: "string",
                    description:
                        "Language of the project's text files (en, zh, ja…). Defaults to the studio locale.",
                },
            },
            async execute(args, call) {
                const summary = await api.createProject({
                    title: args.title,
                    ...(args.brief ? { brief: args.brief } : {}),
                    ...(args.id ? { id: args.id } : {}),
                    ...(args.locale ? { locale: args.locale } : {}),
                });
                rememberSessionProject(call, summary.id);
                return compact({
                    ok: true,
                    project: summary.id,
                    root: summary.root,
                    hint: "Work under `root` with the file tools (in the Studio, open the project so the panel follows it). Then design the folder structure with the user.",
                });
            },
        }),
        tool({
            name: "tongflow_project_open",
            description:
                "Make a project the working project of this session (the Studio panel follows it) and return its status. Use when the user names a project or several exist.",
            parameters: {
                project: {
                    type: "string",
                    required: true,
                    description: "Project id (see tongflow_project_list).",
                },
            },
            async execute(args, call) {
                const id = await resolveProjectId(env, call, args.project);
                rememberSessionProject(call, id);
                return compact(await api.status(id));
            },
        }),
        tool({
            name: "tongflow_project_list",
            description: "List studio projects.",
            parameters: {},
            async execute() {
                const projects = await api.listProjects();
                return compact({
                    projects: projects.map((p) => ({
                        id: p.id,
                        title: p.title,
                        ...(p.brief ? { brief: p.brief } : {}),
                        root: p.root,
                        workflows: p.workflowCount,
                        files: p.fileCount,
                        updatedAt: p.updatedAt,
                    })),
                });
            },
        }),
        tool({
            name: "tongflow_project_status",
            description:
                "What exists in a project: the folder tree (workflows shown with the files they generated), every workflow with its inputs and output count, recent runs, and the brief. Call this first — the user may have moved or edited things by hand.",
            parameters: { project: PROJECT_PARAM },
            async execute(args, call) {
                const id = await resolveProjectId(env, call, args.project);
                return compact(await api.status(id));
            },
        }),
    ];
}
