/** Same-origin client for the studio's HTTP routes (`/tongflow/…`). */
import type {
    OutputInfo,
    PluginConfirmation,
    ProjectSummary,
    RunEvent,
    RunSummary,
    TreeNode,
    WorkflowFileMeta,
    WorkflowSummary,
} from "../shared/types.ts";

export const PREFIX = "/tongflow";

async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    raw?: BodyInit,
): Promise<T> {
    const res = await fetch(`${PREFIX}${path}`, {
        method,
        headers:
            body !== undefined
                ? { "content-type": "application/json" }
                : undefined,
        body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
        credentials: "same-origin",
    });
    const text = await res.text();
    let data: unknown;
    try {
        data = text ? JSON.parse(text) : undefined;
    } catch {
        data = text;
    }
    if (!res.ok) {
        const message =
            (data as { error?: string } | undefined)?.error ??
            `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return data as T;
}

export interface Health {
    ok: boolean;
    studioRoot: string;
    python?: string;
    sdkSpec: string;
    locale: string;
    error?: string;
}

export interface WorkflowDoc {
    name: string;
    description?: string;
    flow: { nodes: unknown[]; edges: unknown[] };
    executable?: {
        inputs?: { name: string; type: string; required: boolean }[];
        outputs?: { name: string; type: string }[];
    };
    exportError?: string;
    meta: WorkflowFileMeta;
}

export const studio = {
    health: () => call<Health>("GET", "/health"),
    sessionProject: (sid: string) =>
        call<{ project: string | null }>(
            "GET",
            `/session/${encodeURIComponent(sid)}/project`,
        ),
    projects: () => call<ProjectSummary[]>("GET", "/projects"),
    createProject: (body: { title: string; brief?: string; locale?: string }) =>
        call<ProjectSummary>("POST", "/projects", body),
    project: (pid: string) => call<ProjectSummary>("GET", `/p/${pid}`),
    tree: (pid: string) => call<TreeNode[]>("GET", `/p/${pid}/tree`),
    workflows: (pid: string) =>
        call<WorkflowSummary[]>("GET", `/p/${pid}/workflows`),
    workflow: (pid: string, key: string) =>
        call<WorkflowDoc>(
            "GET",
            `/p/${pid}/workflow?key=${encodeURIComponent(key)}`,
        ),
    saveWorkflow: (pid: string, key: string, doc: WorkflowDoc) =>
        call<WorkflowSummary>(
            "PUT",
            `/p/${pid}/workflow?key=${encodeURIComponent(key)}`,
            doc,
        ),
    newWorkflow: (
        pid: string,
        body: { path: string; copyFrom?: string; name?: string },
    ) => call<WorkflowSummary>("POST", `/p/${pid}/workflows`, body),
    workflowSummary: (pid: string, key: string) =>
        call<WorkflowSummary>(
            "GET",
            `/p/${pid}/workflow/summary?key=${encodeURIComponent(key)}`,
        ),
    workflowConfirmations: (pid: string, key: string) =>
        call<PluginConfirmation[]>(
            "GET",
            `/p/${pid}/workflow/confirmations?key=${encodeURIComponent(key)}`,
        ),
    workflowOutputs: (pid: string, key: string) =>
        call<OutputInfo[]>(
            "GET",
            `/p/${pid}/workflow/outputs?key=${encodeURIComponent(key)}`,
        ),
    describeWorkflow: (pid: string, key: string) =>
        call<Record<string, unknown>>(
            "GET",
            `/p/${pid}/workflow/describe?key=${encodeURIComponent(key)}`,
        ),
    runs: (pid: string) => call<RunSummary[]>("GET", `/p/${pid}/runs`),
    startRun: (
        pid: string,
        body: {
            workflowKey: string;
            inputs?: Record<string, unknown>;
            note?: string;
        },
    ) => call<RunSummary>("POST", `/p/${pid}/runs`, body),
    run: (runId: string) => call<RunSummary>("GET", `/runs/${runId}`),
    cancelRun: (runId: string) =>
        call<{ ok: true }>("POST", `/runs/${runId}/cancel`),
    readText: async (pid: string, key: string) => {
        const res = await fetch(fileUrl(pid, key), {
            credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
    },
    writeText: (pid: string, key: string, text: string) =>
        call<{ ok: true }>(
            "PUT",
            `/p/${pid}/files/${encodeKey(key)}`,
            undefined,
            text,
        ),
    /** Upload files into a project folder (default uploads/); never overwrites. */
    upload: async (pid: string, dir: string, files: File[] | FileList) => {
        const form = new FormData();
        for (const f of Array.from(files)) form.append("file", f, f.name);
        const res = await fetch(
            `${PREFIX}/p/${pid}/upload?dir=${encodeURIComponent(dir)}`,
            { method: "POST", body: form, credentials: "same-origin" },
        );
        const data = (await res.json().catch(() => undefined)) as
            | {
                  files?: { key: string; size: number; name: string }[];
                  error?: string;
              }
            | undefined;
        if (!res.ok)
            throw new Error(data?.error ?? `${res.status} ${res.statusText}`);
        return data?.files ?? [];
    },
    deleteFile: (pid: string, key: string) =>
        call<{ ok: true }>("DELETE", `/p/${pid}/files/${encodeKey(key)}`),
    plugins: () =>
        call<{
            registry: {
                nodePluginMap: Record<string, string[]>;
                plugins: Record<
                    string,
                    {
                        name?: string;
                        description?: string;
                        methodsByNodeSlot: Record<string, unknown>;
                    }
                >;
            };
            meta: Record<
                string,
                {
                    env: {
                        key: string;
                        required?: boolean;
                        description?: string;
                        url?: string;
                    }[];
                }
            >;
            official: string[];
        }>("GET", "/plugins"),
    installPlugin: (idOrUrl: string) =>
        call<{ id: string; alreadyInstalled: boolean }>(
            "POST",
            "/plugins/install",
            { idOrUrl },
        ),
    uninstallPlugin: (id: string) =>
        call<{ ok: true }>("DELETE", `/plugins/${id}`),
};

export function encodeKey(key: string): string {
    return key.split("/").map(encodeURIComponent).join("/");
}

export function fileUrl(pid: string, key: string): string {
    if (/^(https?:|data:|blob:)/.test(key)) return key;
    return `${PREFIX}/p/${pid}/files/${encodeKey(key.replace(/^\//, ""))}`;
}

/** Subscribe to a run's SSE stream; returns an unsubscribe function. */
export function subscribeRun(
    runId: string,
    onFrame: (frame: { event: RunEvent; summary: RunSummary }) => void,
    onEnd?: () => void,
): () => void {
    const es = new EventSource(`${PREFIX}/runs/${runId}/events`);
    es.onmessage = (e) => {
        try {
            onFrame(JSON.parse(e.data));
        } catch {
            // ignore
        }
    };
    es.onerror = () => {
        es.close();
        onEnd?.();
    };
    return () => es.close();
}
