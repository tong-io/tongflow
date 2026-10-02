/**
 * Workflow tools: create / patch / read / list / validate.
 *
 * The graph-editing tools wrap tongflow's own agent tools
 * (apply_graph_patch, read_canvas, validate_workflow, describe_node_type),
 * adding the `workflow` file argument — the file on disk is the canvas.
 */
import { describeNodeType } from "tongflow";
import type { WorkflowFileMeta } from "../shared/types.ts";
import { type ToolSpec, tool } from "./spec.ts";
import {
    compact,
    PROJECT_PARAM,
    resolveProjectId,
    type ToolEnv,
} from "./support.ts";

const WORKFLOW_PARAM = {
    type: "string",
    required: true,
    description:
        "Workflow file, project-relative, e.g. 'characters/mei/mei_ref' or 'characters/mei/mei_ref.tongflow.json'.",
} as const;

const NODE_REF =
    "A node reference: an alias declared in this patch's add_nodes, or an existing node's short id (8 chars, as shown by tongflow_workflow_read).";

export function workflowTools(env: ToolEnv): ToolSpec[] {
    const { api } = env;
    return [
        tool({
            name: "tongflow_workflow_new",
            description:
                "Create a new, empty workflow file at a path you choose inside the project — ONE FILE PER GENERATED ASSET, placed in the folder where that asset belongs (e.g. 'characters/mei/mei_ref', 'episodes/ep01/shots/sh010/keyframe'). Its outputs will land next to it as <name>.01.png, <name>.02.png … plus <name>.runs.json. " +
                "Every image / audio / video / 3D asset is made this way: create → patch nodes (concrete prompt, file refs, params) → run. Never overwrite an existing file; patch it instead. copy_from clones another workflow of this project as the starting point.",
            parameters: {
                project: PROJECT_PARAM,
                path: {
                    type: "string",
                    required: true,
                    description:
                        "Project-relative path of the new file, without or with the .tongflow.json suffix. Folders are created as needed.",
                },
                copy_from: {
                    type: "string",
                    description:
                        "Another workflow of this project to copy the graph from (its outputs are not copied).",
                },
                name: { type: "string", description: "Display name." },
                description: {
                    type: "string",
                    description: "What this workflow makes and why.",
                },
                purpose: {
                    type: "string",
                    description: "Free-form purpose recorded in meta.",
                },
            },
            async execute(args, call) {
                const pid = await resolveProjectId(env, call, args.project);
                const meta: WorkflowFileMeta = {};
                if (args.purpose) meta.purpose = args.purpose;
                return compact(
                    await api.newWorkflow(pid, args.path, {
                        ...(args.copy_from ? { copyFrom: args.copy_from } : {}),
                        ...(args.name ? { name: args.name } : {}),
                        ...(args.description
                            ? { description: args.description }
                            : {}),
                        meta,
                    }),
                );
            },
        }),
        tool({
            name: "tongflow_workflow_patch",
            description:
                "The ONLY way to change a workflow's graph. Describes one coherent change: nodes to create, edges to draw, params to set, nodes to delete. " +
                "Patch incrementally — never rebuild an existing workflow from scratch. Reference new nodes by the alias you give them; existing nodes by their short id. Never invent uuids. " +
                "Graph grammar: data node (textNode / imageNode / audioNode / videoNode …) → executable node → its output data nodes are created automatically. " +
                "For a data node use data:{texts:[…]} or data:{fileKeys:['./mei_ref.02.png']} — file paths are relative to the workflow file ('./x', '../x') or to the project root ('characters/mei/x.png'); URLs pass through. " +
                "Include text files inside ONE prompt with {{path}} placeholders, e.g. texts:['{{../style.md}} {{./mei.md}} full-body reference sheet, front view'] (expanded at run time) — never chain text-combining nodes for that. " +
                "A level-0 data node WITHOUT static data becomes a workflow INPUT supplied at run time (tongflow_workflow_run inputs) — give it a readable name with data:{inputName:'prompt'} (else it is input_<id>). Prefer writing values into the nodes so the file is self-contained. " +
                "Use tongflow_node_catalog / tongflow_node_describe to see node types, their wires and config fields.",
            parameters: {
                project: PROJECT_PARAM,
                workflow: WORKFLOW_PARAM,
                add_nodes: {
                    type: "array",
                    description:
                        "Nodes to create. Layout is automatic — never supply coordinates.",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            alias: {
                                type: "string",
                                required: true,
                                description:
                                    "Short local name (e.g. 't1', 'gen1') used in add_edges within this patch.",
                            },
                            type: {
                                type: "string",
                                required: true,
                                description:
                                    "Canvas node type from the catalog (e.g. 'textNode', 'textGenImageNode', 'imageGenVideoNode').",
                            },
                            data: {
                                type: "object",
                                additionalProperties: true,
                                description:
                                    "Initial data. textNode: {texts:[…]}; imageNode etc.: {fileKeys:[…]} (project paths); executable node: its config fields (e.g. {aspect_ratio:'16:9', duration:5}). Never set 'prompt'.",
                            },
                            pluginId: {
                                type: "string",
                                description:
                                    "Explicit plugin for an executable node (see catalog). Omit to use the installed default.",
                            },
                            pluginModel: {
                                type: "string",
                                description:
                                    "Model id, only for plugins that advertise models.",
                            },
                        },
                    },
                },
                add_edges: {
                    type: "array",
                    description:
                        "Edges to draw. Handles are derived automatically; supply them only to disambiguate (e.g. several images into 'in:images').",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            from: {
                                type: "string",
                                required: true,
                                description: NODE_REF,
                            },
                            to: {
                                type: "string",
                                required: true,
                                description: NODE_REF,
                            },
                            fromHandle: {
                                type: "string",
                                description:
                                    "Optional source handle, e.g. 'out:image'.",
                            },
                            toHandle: {
                                type: "string",
                                description:
                                    "Optional target handle, e.g. 'in:images'.",
                            },
                        },
                    },
                },
                update_nodes: {
                    type: "array",
                    description:
                        "Change params on existing nodes. Merged into current data — send only the keys you are changing.",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            id: {
                                type: "string",
                                required: true,
                                description: NODE_REF,
                            },
                            data: {
                                type: "object",
                                additionalProperties: true,
                                required: true,
                            },
                        },
                    },
                },
                remove_nodes: {
                    type: "array",
                    description: "Node references to delete.",
                    items: { type: "string" },
                },
            },
            async execute(args, call) {
                const pid = await resolveProjectId(env, call, args.project);
                const patch: Record<string, unknown> = {};
                if (args.add_nodes) patch.add_nodes = args.add_nodes;
                if (args.add_edges) patch.add_edges = args.add_edges;
                if (args.update_nodes) patch.update_nodes = args.update_nodes;
                if (args.remove_nodes) patch.remove_nodes = args.remove_nodes;
                return compact(
                    await api.graphTool(
                        pid,
                        args.workflow,
                        "apply_graph_patch",
                        patch,
                    ),
                );
            },
        }),
        tool({
            name: "tongflow_workflow_read",
            description:
                "Read a workflow file in full: rendered graph (nodes with short ids, params, edges), inputs, outputs, the files it has generated so far (with numbers and notes) and a validation report. " +
                "Read before patching a workflow you did not just create, and after the user edited it on the canvas.",
            parameters: { project: PROJECT_PARAM, workflow: WORKFLOW_PARAM },
            async execute(args, call) {
                const pid = await resolveProjectId(env, call, args.project);
                return compact(await api.describeWorkflow(pid, args.workflow));
            },
        }),
        tool({
            name: "tongflow_workflow_list",
            description:
                "List every workflow file in the project (any folder) with its inputs and how many files it has generated.",
            parameters: { project: PROJECT_PARAM },
            async execute(args, call) {
                const pid = await resolveProjectId(env, call, args.project);
                return compact(await api.listWorkflows(pid));
            },
        }),
        tool({
            name: "tongflow_workflow_validate",
            description:
                "Health-check a workflow: cycles, unconnected required inputs, empty required config, missing / uninstalled plugins. Run it before executing.",
            parameters: { project: PROJECT_PARAM, workflow: WORKFLOW_PARAM },
            async execute(args, call) {
                const pid = await resolveProjectId(env, call, args.project);
                return compact(
                    await api.graphTool(
                        pid,
                        args.workflow,
                        "validate_workflow",
                        {},
                    ),
                );
            },
        }),
        tool({
            name: "tongflow_workflow_compose",
            description:
                "Compose several small workflows into ONE big workflow file for a whole-picture canvas view and one-shot re-runs (e.g. a shot's keyframe → i2v → lip-sync, or everything under a scene folder). " +
                "Where a part references another part's output file (an imageNode with './keyframe.02.png' while keyframe.tongflow.json sits in the same folder), that file becomes a real edge from the producing node; other file refs stay files. Every stage's product remains an output, named after its part (<all>.01.keyframe.png, <all>.01.i2v.mp4). The parts are not modified. " +
                "Do this after the parts exist and were reviewed; tell the user to open the composed file on the canvas.",
            parameters: {
                project: PROJECT_PARAM,
                workflows: {
                    type: "array",
                    items: { type: "string" },
                    description:
                        "Workflow files in production order (project-relative). Either this or folder.",
                },
                folder: {
                    type: "string",
                    description:
                        "Compose every workflow under this folder, at any depth, sorted by path (previous *_all files excluded at every level). This is how a parent folder gets the whole picture of everything beneath it: it takes the leaf workflows, not its children's composed files, so every file reference still matches the part that produces it.",
                },
                path: {
                    type: "string",
                    description:
                        "Where to write the composed file (default: <folder of the first part>/<folder name>_all).",
                },
                name: { type: "string", description: "Display name." },
            },
            async execute(args, call) {
                const pid = await resolveProjectId(env, call, args.project);
                return compact(
                    await api.composeWorkflows(pid, {
                        ...(args.workflows
                            ? { workflows: args.workflows }
                            : {}),
                        ...(args.folder !== undefined
                            ? { folder: args.folder }
                            : {}),
                        ...(args.path ? { path: args.path } : {}),
                        ...(args.name ? { name: args.name } : {}),
                    }),
                );
            },
        }),
        tool({
            name: "tongflow_node_catalog",
            description:
                "One line per canvas node type: ABI slot, wires (inputs from other nodes; * = required), config fields, outputs, and which installed plugins implement it. Consult before patching.",
            parameters: {},
            returns: "string",
            async execute() {
                return api.nodeCatalog();
            },
        }),
        tool({
            name: "tongflow_node_describe",
            description:
                "Full config schema for one node type (enums, ranges, defaults) — more detail than the catalog line. Use before setting an unfamiliar param.",
            parameters: {
                type: {
                    type: "string",
                    required: true,
                    description: "Canvas node type, e.g. 'imageGenVideoNode'.",
                },
            },
            async execute(args) {
                return compact(describeNodeType(args.type));
            },
        }),
    ];
}
