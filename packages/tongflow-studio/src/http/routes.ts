/**
 * The studio's HTTP routes as one `node:http` handler, mounted by the host
 * under `<prefix>` (default `/tongflow`):
 *
 *   Studio API (JSON)              /tongflow/projects, /tongflow/p/:pid/…, /tongflow/runs/…, /tongflow/plugins…
 *   Files (Range)                  /tongflow/p/:pid/files/<key>
 *   Canvas-compat API              /tongflow/p/:pid/api/…  — what `tongflow/canvas` calls when its
 *                                  apiBaseUrl is `/tongflow/p/:pid` (task create/wait/stop, plugins registry,
 *                                  upload, uploads, material stubs).
 */

import { unlink } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

import { TaskStatus } from "tongflow";
import type { StudioApi } from "../api.ts";
import type { RunRecord } from "../engine/runs.ts";
import type { CanvasTaskBody } from "../engine/single-node.ts";
import { getSessionProject } from "../session-projects.ts";
import type {
    RunEvent,
    RunSummary,
    WorkflowFileMeta,
} from "../shared/types.ts";
import type { Studio } from "../studio.ts";
import { writeFileAtomic } from "../util/fsx.ts";
import { serveFile } from "./files.ts";
import { openSse } from "./sse.ts";
import {
    assertSameOrigin,
    compileRoute,
    HttpError,
    type Route,
    type RouteContext,
    readFormData,
    readJson,
    sendError,
    sendJson,
} from "./util.ts";

/** Where files dropped onto the canvas land inside a project. */
const UPLOADS_DIR = "uploads";

export interface RouteEnv {
    studio: Studio;
    api: StudioApi;
    prefix: string;
}

export type RouteHandler = (
    req: IncomingMessage,
    res: ServerResponse,
) => Promise<void>;

/** The prefix as routes match it: no trailing slash, `/tongflow` when empty. */
export function routePrefix(prefix: string): string {
    return prefix.replace(/\/+$/, "") || "/tongflow";
}

export function createRouteHandler(env: RouteEnv): RouteHandler {
    const prefix = routePrefix(env.prefix);
    const routes = buildRoutes(env).map(compileRoute);
    return async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const path = url.pathname.slice(prefix.length) || "/";
        const method = req.method ?? "GET";
        try {
            for (const { route, match } of routes) {
                if (
                    route.method !== method &&
                    !(route.method === "GET" && method === "HEAD")
                )
                    continue;
                const m = match(path);
                if (!m) continue;
                if (method !== "GET" && method !== "HEAD")
                    assertSameOrigin(req);
                await route.handler({
                    req,
                    res,
                    url,
                    params: m.params,
                    rest: m.rest,
                });
                return;
            }
            sendJson(res, 404, { error: `no route for ${method} ${path}` });
        } catch (error) {
            if (!res.headersSent) sendError(res, error);
            else res.end();
        }
    };
}

function q(url: URL, name: string): string | undefined {
    const v = url.searchParams.get(name);
    return v === null ? undefined : v;
}

function requireQ(url: URL, name: string): string {
    const v = q(url, name);
    if (!v) throw new HttpError(400, `missing query parameter "${name}"`);
    return v;
}

function buildRoutes(env: RouteEnv): Route[] {
    const { api, studio } = env;
    const json = (c: RouteContext, body: unknown, status = 200) =>
        sendJson(c.res, status, body);

    return [
        /* ---------------- health / config ---------------- */
        {
            method: "GET",
            pattern: "/health",
            handler: async (c) => {
                let python: string | undefined;
                let error: string | undefined;
                try {
                    python = await studio.python();
                } catch (e) {
                    error = e instanceof Error ? e.message : String(e);
                }
                json(c, {
                    ok: !error,
                    studioRoot: studio.paths.root,
                    python,
                    sdkSpec: studio.config.sdkSpec,
                    locale: studio.config.locale,
                    ...(error ? { error } : {}),
                });
            },
        },

        {
            method: "GET",
            pattern: "/env",
            handler: async (c) => {
                const stored = await studio.readEnvFile();
                const { meta } = await api.registry();
                const wanted = new Map<
                    string,
                    {
                        plugins: string[];
                        required: boolean;
                        description?: string;
                        url?: string;
                    }
                >();
                for (const [pid, m] of Object.entries(meta)) {
                    for (const e of m.env) {
                        const w = wanted.get(e.key) ?? {
                            plugins: [],
                            required: false,
                        };
                        w.plugins.push(pid);
                        w.required = w.required || Boolean(e.required);
                        if (e.description) w.description = e.description;
                        if (e.url) w.url = e.url;
                        wanted.set(e.key, w);
                    }
                }
                const keys = [...wanted.entries()].map(([key, w]) => ({
                    key,
                    ...w,
                    set: Boolean(
                        stored[key] ||
                            studio.config.env[key] ||
                            process.env[key],
                    ),
                    source: stored[key]
                        ? "studio"
                        : studio.config.env[key]
                          ? "config"
                          : process.env[key]
                            ? "process"
                            : undefined,
                }));
                for (const key of Object.keys(stored))
                    if (!wanted.has(key))
                        keys.push({
                            key,
                            plugins: [],
                            required: false,
                            set: true,
                            source: "studio",
                        });
                json(c, { keys });
            },
        },
        {
            method: "PUT",
            pattern: "/env",
            handler: async (c) => {
                const body = await readJson<Record<string, string | null>>(
                    c.req,
                );
                const saved = await studio.updateEnvFile(body);
                json(c, { keys: Object.keys(saved) });
            },
        },

        /** The project the given host session's agent is working in (set by its tool calls). */
        {
            method: "GET",
            pattern: "/session/:sid/project",
            handler: async (c) =>
                json(c, { project: getSessionProject(c.params.sid) ?? null }),
        },

        /* ---------------- projects ---------------- */
        {
            method: "GET",
            pattern: "/projects",
            handler: async (c) => json(c, await api.listProjects()),
        },
        {
            method: "POST",
            pattern: "/projects",
            handler: async (c) => {
                const body = await readJson<{
                    title?: string;
                    brief?: string;
                    id?: string;
                    locale?: string;
                }>(c.req);
                if (!body.title) throw new HttpError(400, "title is required");
                json(
                    c,
                    await api.createProject({
                        title: body.title,
                        ...(body.brief ? { brief: body.brief } : {}),
                        ...(body.id ? { id: body.id } : {}),
                        ...(body.locale ? { locale: body.locale } : {}),
                    }),
                    201,
                );
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid",
            handler: async (c) =>
                json(c, await api.projectSummary(c.params.pid)),
        },
        {
            method: "GET",
            pattern: "/p/:pid/status",
            handler: async (c) => json(c, await api.status(c.params.pid)),
        },
        {
            method: "GET",
            pattern: "/p/:pid/tree",
            handler: async (c) => json(c, await api.tree(c.params.pid)),
        },

        /* ---------------- workflows ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/workflows",
            handler: async (c) =>
                json(c, await api.listWorkflows(c.params.pid)),
        },
        {
            method: "GET",
            pattern: "/p/:pid/workflow",
            handler: async (c) =>
                json(
                    c,
                    await api.readWorkflowForCanvas(
                        c.params.pid,
                        requireQ(c.url, "key"),
                    ),
                ),
        },
        {
            method: "PUT",
            pattern: "/p/:pid/workflow",
            handler: async (c) => {
                const key = requireQ(c.url, "key");
                const doc = await readJson<
                    Parameters<StudioApi["saveWorkflowDocument"]>[2]
                >(c.req);
                json(c, await api.saveWorkflowDocument(c.params.pid, key, doc));
            },
        },
        {
            method: "DELETE",
            pattern: "/p/:pid/workflow",
            handler: async (c) => {
                await api.deleteWorkflow(c.params.pid, requireQ(c.url, "key"));
                json(c, { ok: true });
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/workflows",
            handler: async (c) => {
                const body = await readJson<{
                    path?: string;
                    copyFrom?: string;
                    name?: string;
                    description?: string;
                    meta?: WorkflowFileMeta;
                }>(c.req);
                if (!body.path) throw new HttpError(400, "path is required");
                json(
                    c,
                    await api.newWorkflow(c.params.pid, body.path, body),
                    201,
                );
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/workflow/patch",
            handler: async (c) => {
                const key = requireQ(c.url, "key");
                const patch = await readJson<Record<string, unknown>>(c.req);
                json(
                    c,
                    await api.graphTool(
                        c.params.pid,
                        key,
                        "apply_graph_patch",
                        patch,
                    ),
                );
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/compose",
            handler: async (c) => {
                const body = await readJson<{
                    workflows?: string[];
                    folder?: string;
                    path?: string;
                    name?: string;
                }>(c.req);
                json(c, await api.composeWorkflows(c.params.pid, body), 201);
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid/workflow/describe",
            handler: async (c) =>
                json(
                    c,
                    await api.describeWorkflow(
                        c.params.pid,
                        requireQ(c.url, "key"),
                    ),
                ),
        },

        {
            method: "GET",
            pattern: "/p/:pid/workflow/summary",
            handler: async (c) =>
                json(
                    c,
                    await api.workflowSummary(
                        c.params.pid,
                        requireQ(c.url, "key"),
                    ),
                ),
        },
        {
            method: "GET",
            pattern: "/p/:pid/workflow/confirmations",
            handler: async (c) =>
                json(
                    c,
                    await api.paidPlugins(c.params.pid, requireQ(c.url, "key")),
                ),
        },
        {
            method: "GET",
            pattern: "/p/:pid/workflow/outputs",
            handler: async (c) =>
                json(
                    c,
                    await api.workflowOutputs(
                        c.params.pid,
                        requireQ(c.url, "key"),
                    ),
                ),
        },

        /* ---------------- runs ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/runs",
            handler: async (c) => json(c, api.listRuns(c.params.pid)),
        },
        {
            method: "POST",
            pattern: "/p/:pid/runs",
            handler: async (c) => {
                const body = await readJson<{
                    workflowKey?: string;
                    inputs?: Record<string, unknown>;
                    note?: string;
                }>(c.req);
                if (!body.workflowKey)
                    throw new HttpError(400, "workflowKey is required");
                const record = await api.startRun({
                    projectId: c.params.pid,
                    ...body,
                });
                json(c, record.summary, 202);
            },
        },
        {
            method: "GET",
            pattern: "/runs/:runId",
            handler: async (c) => {
                const r = api.getRun(c.params.runId);
                if (!r) throw new HttpError(404, "unknown run");
                json(c, r.summary);
            },
        },
        {
            method: "GET",
            pattern: "/runs/:runId/events",
            handler: async (c) => {
                const r = api.getRun(c.params.runId);
                if (!r) throw new HttpError(404, "unknown run");
                streamRun(c, r, (event, summary) => ({ event, summary }));
            },
        },
        {
            method: "POST",
            pattern: "/runs/:runId/cancel",
            handler: async (c) => {
                const r = api.getRun(c.params.runId);
                if (!r) throw new HttpError(404, "unknown run");
                r.cancel("cancelled from studio");
                json(c, { ok: true });
            },
        },

        /* ---------------- plugins ---------------- */
        {
            method: "GET",
            pattern: "/plugins",
            handler: async (c) => {
                const { registry, meta, scannedAt } = await api.registry();
                const OFFICIAL_PLUGINS = await studio.registry.officialIds();
                json(c, {
                    registry,
                    meta,
                    scannedAt,
                    official: OFFICIAL_PLUGINS,
                });
            },
        },
        {
            method: "POST",
            pattern: "/plugins/install",
            handler: async (c) => {
                const body = await readJson<{ idOrUrl?: string }>(c.req);
                if (!body.idOrUrl)
                    throw new HttpError(400, "idOrUrl is required");
                json(c, await api.installPlugin(body.idOrUrl));
            },
        },
        {
            method: "DELETE",
            pattern: "/plugins/:id",
            handler: async (c) => {
                await api.uninstallPlugin(c.params.id);
                json(c, { ok: true });
            },
        },
        {
            method: "POST",
            pattern: "/plugins/update",
            handler: async (c) =>
                json(c, { changed: await api.updatePlugins() }),
        },
        {
            method: "GET",
            pattern: "/catalog",
            handler: async (c) => json(c, { catalog: await api.nodeCatalog() }),
        },

        /* ---------------- files ---------------- */
        /** Studio upload: multipart `file` field(s) into `?dir=<project key>` (default `uploads/`). */
        {
            method: "POST",
            pattern: "/p/:pid/upload",
            handler: async (c) => {
                const form = await readFormData(c.req);
                const dir = q(c.url, "dir") || UPLOADS_DIR;
                const files = form
                    .getAll("file")
                    .filter((f) => f instanceof File) as File[];
                if (files.length === 0)
                    throw new HttpError(
                        400,
                        "multipart field 'file' is required",
                    );
                const out: { key: string; size: number; name: string }[] = [];
                for (const file of files) {
                    const r = await api.uploadFile(
                        c.params.pid,
                        dir,
                        file.name,
                        new Uint8Array(await file.arrayBuffer()),
                    );
                    out.push({ ...r, name: file.name });
                }
                json(c, { files: out }, 201);
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid/files/*",
            handler: async (c) =>
                serveFile(
                    c.req,
                    c.res,
                    await api.filePath(c.params.pid, c.rest),
                ),
        },
        {
            method: "PUT",
            pattern: "/p/:pid/files/*",
            handler: async (c) => {
                const buf = await (await import("./util.ts")).readBody(c.req);
                const abs = await api.filePath(c.params.pid, c.rest);
                await writeFileAtomic(abs, buf);
                json(c, { ok: true, key: c.rest });
            },
        },
        {
            method: "DELETE",
            pattern: "/p/:pid/files/*",
            handler: async (c) => {
                await unlink(await api.filePath(c.params.pid, c.rest));
                json(c, { ok: true });
            },
        },
        /* ---------------- canvas-compat (`tongflow/canvas` with apiBaseUrl=/tongflow/p/:pid) ---------------- */
        {
            method: "GET",
            pattern: "/p/:pid/api/plugins/registry",
            handler: async (c) => json(c, (await api.registry()).registry),
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/task/create",
            handler: async (c) => {
                const body = await readJson<CanvasTaskBody>(c.req);
                if (!body.feature || !body.pluginId)
                    throw new HttpError(
                        400,
                        "feature and pluginId are required",
                    );
                const record = await api.startCanvasRun(c.params.pid, body);
                json(c, { taskId: record.summary.runId });
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid/api/task/wait",
            handler: async (c) => {
                const taskId = requireQ(c.url, "taskId");
                const r = api.getRun(taskId);
                if (!r) throw new HttpError(404, "unknown task");
                const nodeId = r.summary.workflow.startsWith("canvas ")
                    ? canvasNodeId(r)
                    : null;
                streamRun(c, r, (event, summary) =>
                    canvasFrame(taskId, nodeId, event, summary, r),
                );
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/task/stop",
            handler: async (c) => {
                const body = await readJson<{ taskId?: string }>(c.req);
                const r = body.taskId ? api.getRun(body.taskId) : undefined;
                if (!r) throw new HttpError(404, "unknown task");
                const wasRunning =
                    r.summary.status === "running" ||
                    r.summary.status === "queued";
                r.cancel("stopped from canvas");
                json(c, { status: "cancelled", wasRunning });
            },
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/task/update-status",
            handler: async (c) => json(c, { success: true, skipped: true }),
        },
        {
            method: "GET",
            pattern: "/p/:pid/api/task/list",
            handler: async (c) => json(c, { tasks: [] }),
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/upload",
            handler: async (c) => {
                const form = await readFormData(c.req);
                const file = form.get("file");
                if (!(file instanceof File))
                    throw new HttpError(
                        400,
                        "multipart field 'file' is required",
                    );
                const { key, size } = await api.uploadFile(
                    c.params.pid,
                    UPLOADS_DIR,
                    file.name,
                    new Uint8Array(await file.arrayBuffer()),
                );
                json(c, {
                    fileKey: key,
                    url: `${env.prefix}/p/${c.params.pid}/files/${key}`,
                    size,
                    name: file.name,
                });
            },
        },
        {
            method: "GET",
            pattern: "/p/:pid/api/uploads/*",
            handler: async (c) =>
                serveFile(
                    c.req,
                    c.res,
                    await api.filePath(c.params.pid, c.rest),
                ),
        },
        // Material library: not part of the studio (takes are the library). Keep the canvas quiet.
        {
            method: "GET",
            pattern: "/p/:pid/api/material",
            handler: async (c) => json(c, { materials: [], total: 0 }),
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/material",
            handler: async (c) => json(c, { id: 0 }),
        },
        {
            method: "POST",
            pattern: "/p/:pid/api/material/save-from-task",
            handler: async (c) => json(c, { saved: false }),
        },
        {
            method: "GET",
            pattern: "/p/:pid/api/feature/list",
            handler: async (c) => json(c, { features: [] }),
        },
    ];
}

/* ---------------- run streaming ---------------- */

function streamRun<T>(
    c: RouteContext,
    r: RunRecord,
    map: (event: RunEvent, summary: RunSummary) => T | undefined,
): void {
    const sse = openSse(c.req, c.res);
    const send = (event: RunEvent, summary: RunSummary) => {
        const frame = map(event, summary);
        if (frame !== undefined) sse.send(frame);
    };
    for (const e of r.events) send(e, r.summary);
    if (r.summary.finishedAt) {
        sse.close();
        return;
    }
    const off = r.subscribe(send);
    void r.done.then(() => {
        off();
        setTimeout(() => sse.close(), 50);
    });
    c.req.on("close", off);
}

function canvasNodeId(r: RunRecord): string | null {
    const doc = r.outcome?.result ? undefined : undefined;
    void doc;
    const first = Object.keys(r.summary.nodes)[0];
    return first ?? null;
}

/** Translate a run event into the SSE envelope `tongflow/canvas` expects. */
function canvasFrame(
    taskId: string,
    nodeIdHint: string | null,
    event: RunEvent,
    summary: RunSummary,
    r: RunRecord,
) {
    const nodeId =
        event.nodeId ?? nodeIdHint ?? Object.keys(summary.nodes)[0] ?? null;
    switch (event.type) {
        case "log":
            return {
                id: taskId,
                status: TaskStatus.RUNNING,
                nodeId,
                data: { message: event.message },
            };
        case "workflow_started":
        case "node_started":
            return {
                id: taskId,
                status: TaskStatus.RUNNING,
                nodeId,
                data: { message: event.label ?? "started" },
            };
        case "plugin_progress":
            return {
                id: taskId,
                status: TaskStatus.RUNNING,
                nodeId,
                data: {
                    message: event.message,
                    ...(event.percent !== undefined
                        ? { progress: event.percent }
                        : {}),
                },
            };
        case "node_failed":
            return {
                id: taskId,
                status: TaskStatus.FAILED,
                nodeId,
                data: { error: event.error },
            };
        case "workflow_failed":
        case "error":
            return {
                id: taskId,
                status:
                    summary.status === "cancelled"
                        ? TaskStatus.CANCELLED
                        : TaskStatus.FAILED,
                nodeId,
                data: { error: event.error ?? summary.error },
            };
        case "ingested": {
            const outputs = event.outputs ?? r.outcome?.result.outputs ?? {};
            const raw =
                (nodeId && outputs[nodeId]) || Object.values(outputs)[0] || {};
            return {
                id: taskId,
                status: TaskStatus.COMPLETED,
                nodeId,
                data: raw,
            };
        }
        default:
            return undefined;
    }
}
