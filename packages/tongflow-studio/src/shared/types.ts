/**
 * Data shapes shared by the host half and the browser half. Pure types +
 * tiny constants only — this file is compiled into both bundles.
 */

/** `project.json` at the project root. */
export interface ProjectManifest {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    /** What the user wants to make, in their own words (the agent reads this first). */
    brief?: string;
    /** Language of the project's text files / UI (en, zh, ja…). */
    locale?: string;
}

/** How a plugin is billed — what the user is asked to confirm before the first run. */
export type PluginBilling = "api" | "modal" | "local";

/**
 * One paid plugin a workflow run would use. Every run that costs money is
 * confirmed by the user each time; nothing is remembered.
 */
export interface PluginConfirmation {
    pluginId: string;
    name?: string;
    billing: PluginBilling;
    /** Plain-language billing note the agent relays to the user. */
    billingNote: string;
    /** Model(s) the workflow's nodes ask for (from node data), if any. */
    models: string[];
    /** Models the plugin advertises for the slots involved. */
    availableModels: string[];
    /** Env keys the plugin needs and whether they are set. */
    env: { key: string; required: boolean; set: boolean }[];
    /** Node slots this plugin serves in the workflow. */
    slots: string[];
    /** Other installed plugins for the same slots (id → slots). */
    alternatives: {
        pluginId: string;
        billing: PluginBilling;
        slots: string[];
    }[];
}

/** One entry of `<stem>.runs.json` — how a numbered output came to be. */
export interface OutputRecord {
    /** Output number shared by every file this run produced (`<stem>.03.png`). */
    no: number;
    runId: string;
    workflowHash: string;
    /** Input name → what was passed for this run. */
    inputs: Record<string, string | string[]>;
    /** File names produced (relative to the workflow's directory). */
    files: string[];
    /** Text outputs (workflow output name → texts), also written as `.txt` files. */
    texts?: Record<string, string[]>;
    pluginIds: string[];
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    note?: string;
}

/** A generated file next to its workflow. */
export interface OutputInfo {
    /** Project-relative key. */
    key: string;
    fileName: string;
    no: number;
    /** Workflow output name when the run produced more than one. */
    output?: string;
    ext: string;
    size: number;
    mtime: string;
    /** Project-relative key of the workflow that made it. */
    workflow: string;
    record?: OutputRecord;
}

/** Studio-side metadata stored in a `.tongflow.json` file under `meta`. */
export interface WorkflowFileMeta {
    /** Free-form purpose note. */
    purpose?: string;
    /** Workflow output name → readable label used in generated file names (`<stem>.01.<label>.png`). */
    outputLabels?: Record<string, string>;
    /** Set on a composed workflow: which small workflows it was built from. */
    composed?: { parts: string[]; at: string };
}

export interface WorkflowSummary {
    key: string;
    name: string;
    description?: string;
    nodeCount: number;
    inputs: {
        name: string;
        type: string;
        required: boolean;
    }[];
    outputs: { name: string; type: string }[];
    meta: WorkflowFileMeta;
    mtime: string;
    /** Number of generated files next to the workflow. */
    outputCount: number;
    /** Highest output number so far (0 when none). */
    lastNo: number;
}

export type RunStatus =
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";

export interface RunEvent {
    type:
        | "log"
        | "workflow_started"
        | "node_started"
        | "plugin_progress"
        | "node_completed"
        | "node_failed"
        | "workflow_completed"
        | "workflow_failed"
        | "ingested"
        | "error";
    at: string;
    nodeId?: string;
    label?: string;
    feature?: string;
    level?: number;
    message?: string;
    percent?: number;
    error?: string;
    totalNodes?: number;
    levels?: number;
    files?: OutputInfo[];
    /** Raw node outputs (nodeId → plugin output), on `ingested`. */
    outputs?: Record<string, unknown>;
}

export interface RunSummary {
    runId: string;
    projectId: string;
    workflow: string;
    status: RunStatus;
    startedAt: string;
    finishedAt?: string;
    error?: string;
    files: OutputInfo[];
    /** Node id → last known state, for canvas overlays. */
    nodes: Record<
        string,
        {
            status: "running" | "completed" | "failed";
            label?: string;
            message?: string;
            percent?: number;
        }
    >;
}

export interface ProjectSummary extends ProjectManifest {
    root: string;
    workflowCount: number;
    fileCount: number;
}

/** Tree node the studio's left pane renders — a plain view of the project folder. */
export interface TreeNode {
    id: string;
    label: string;
    kind: "folder" | "file" | "workflow" | "output";
    /** Project-relative key. */
    key: string;
    children?: TreeNode[];
    meta?: {
        size?: number;
        mtime?: string;
        modality?: Modality;
        /** For outputs: the number and workflow output name. */
        no?: number;
        output?: string;
        /** For workflows: number of generated files. */
        outputCount?: number;
    };
}

export type Modality = "image" | "video" | "audio" | "text" | "model" | "file";

export const MEDIA_EXT: Record<string, Modality> = {
    png: "image",
    jpg: "image",
    jpeg: "image",
    webp: "image",
    gif: "image",
    mp4: "video",
    mov: "video",
    webm: "video",
    mp3: "audio",
    wav: "audio",
    m4a: "audio",
    ogg: "audio",
    flac: "audio",
    md: "text",
    txt: "text",
    json: "text",
    yaml: "text",
    yml: "text",
    csv: "text",
    srt: "text",
    glb: "model",
    gltf: "model",
    obj: "model",
    ply: "model",
    splat: "model",
};

export function modalityOfExt(ext: string): Modality {
    return MEDIA_EXT[ext.toLowerCase().replace(/^\./, "")] ?? "file";
}
