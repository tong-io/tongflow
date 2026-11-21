/**
 * Single-node canvas runs ("Run" on one node) on the TypeScript engine: a
 * canvas `CanvasTaskTransport` that runs the tasks it {@link
 * EngineTaskTransportOptions.handles handles} (typically the nodes bound to a
 * browser plugin) as a one-node workflow in the browser, and hands every
 * other task to the host's own transport (`httpTaskTransport`), unchanged.
 *
 * The one-node workflow is what Studio's server builds for a canvas run:
 * every prompt field becomes a static binding, so asset fields (a host file
 * key, an upload URL, a data URL) are materialized by the engine's asset
 * store exactly as in a whole-workflow run, and binary outputs come back as
 * `{file_key}` refs into that store. On `COMPLETED` the message `data` is
 * the node's raw output, which the canvas routes into downstream data nodes
 * as it does for a server task.
 */

import type {
    CanvasTaskTransport,
    CreateTaskRequest,
    TaskWaitHandlers,
    TaskWaitMessage,
} from "../../canvas/lib/task/transport-types";
import {
    getAbiNodeBySlot,
    getAbiOutputRoutesBySlot,
} from "../../core/schema/tongflow-abi";
import type { ExecutableWorkflow } from "../../core/workflow/executable-workflow";
import { runWorkflow } from "../run-workflow";
import type { EngineEvent, RunResult, RunWorkflowOptions } from "../types";

export type { CanvasTaskTransport };

/** Prefix of the task ids this transport issues. */
export const ENGINE_TASK_PREFIX = "engine-";

const KEEP_TASKS = 64;

/**
 * A one-node executable workflow for a canvas task: static bindings from the
 * prompt, the slot's ABI output routes, the node's model and advanced params.
 */
export function singleNodeWorkflow(
    request: Pick<
        CreateTaskRequest,
        "feature" | "pluginId" | "model" | "params" | "prompt" | "nodeId"
    >,
): ExecutableWorkflow {
    if (!getAbiNodeBySlot(request.feature)) {
        throw new Error(`Unknown ABI slot "${request.feature}"`);
    }
    const nodeId = request.nodeId || "node";
    const routes = getAbiOutputRoutesBySlot(request.feature);
    const bindings: ExecutableWorkflow["executableNodes"][number]["bindings"] =
        {};
    for (const [field, value] of Object.entries(request.prompt ?? {})) {
        if (value === undefined || value === null) continue;
        bindings[field] = { kind: "static", value };
    }
    const params =
        request.params && Object.keys(request.params).length > 0
            ? request.params
            : undefined;
    return {
        name: `canvas:${request.feature}`,
        version: "1.0",
        exportedAt: new Date().toISOString(),
        inputs: [],
        outputs: [],
        dataNodes: [],
        executableNodes: [
            {
                id: nodeId,
                type: request.feature,
                feature: request.feature,
                pluginId: request.pluginId,
                ...(request.model ? { model: request.model } : {}),
                ...(params ? { params } : {}),
                label: request.feature,
                bindings,
                outputs: routes.map((r) => ({
                    sourceField: r.sourceField,
                    nodeType: r.nodeType,
                    dataField: r.dataField,
                    expandEach: r.expandEach,
                    ...(r.itemValuePath
                        ? { itemValuePath: r.itemValuePath }
                        : {}),
                    ...(r.isArrayOfArrays ? { isArrayOfArrays: true } : {}),
                })),
                dependencies: [],
                level: 0,
            },
        ],
        executionLevels: [[nodeId]],
        dataNodeEdges: [],
        originalFlow: { nodes: [], edges: [] },
    } as unknown as ExecutableWorkflow;
}

export interface EngineTaskTransportOptions
    extends Omit<RunWorkflowOptions, "signal" | "onEvent" | "controller"> {
    /** The transport for every task this one does not handle (e.g. `httpTaskTransport`). */
    fallback: CanvasTaskTransport;
    /** True when the task runs on the engine (e.g. its plugin is a browser plugin). */
    handles: (request: CreateTaskRequest) => boolean;
    /** Also receives every raw engine event of a handled task. */
    onEngineEvent?: (event: EngineEvent) => void;
    /** Called with each handled task's result. */
    onResult?: (request: CreateTaskRequest, result: RunResult) => void;
}

interface LocalTask {
    messages: TaskWaitMessage[];
    listeners: Set<TaskWaitHandlers>;
    abort: AbortController;
    done: boolean;
}

function newId(): string {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * A canvas task transport that runs handled tasks on the engine and forwards
 * the rest to `fallback`. Task ids it issues start with
 * {@link ENGINE_TASK_PREFIX}; `waitTask` replays the messages so far, so a
 * late or repeated wait (the canvas reconnects) sees the whole task.
 */
export function createEngineTaskTransport(
    options: EngineTaskTransportOptions,
): CanvasTaskTransport {
    const { fallback, handles, onEngineEvent, onResult, ...engineOptions } =
        options;
    const tasks = new Map<string, LocalTask>();
    const isLocal = (taskId: string) =>
        taskId.startsWith(ENGINE_TASK_PREFIX) && tasks.has(taskId);

    const emit = (task: LocalTask, message: TaskWaitMessage) => {
        if (task.done) return;
        task.messages.push(message);
        const terminal =
            message.status === "COMPLETED" ||
            message.status === "FAILED" ||
            message.status === "CANCELLED";
        if (terminal) task.done = true;
        for (const l of [...task.listeners]) {
            l.onMessage(message);
            if (terminal) l.onClose();
        }
    };

    const start = (taskId: string, request: CreateTaskRequest) => {
        const task: LocalTask = {
            messages: [],
            listeners: new Set(),
            abort: new AbortController(),
            done: false,
        };
        tasks.set(taskId, task);
        // Keep finished tasks only for late / repeated waits.
        for (const [id, t] of tasks) {
            if (tasks.size <= KEEP_TASKS) break;
            if (t.done) tasks.delete(id);
        }
        const nodeId = request.nodeId;
        const base = { id: taskId, nodeId } as const;
        const doc = singleNodeWorkflow(request);
        const ownNodeId = doc.executableNodes[0].id;
        emit(task, { ...base, status: "PENDING" });
        void runWorkflow(doc, {
            ...engineOptions,
            signal: task.abort.signal,
            onEvent: (event) => {
                onEngineEvent?.(event);
                if (event.type === "node_started") {
                    emit(task, {
                        ...base,
                        status: "RUNNING",
                        data: { message: event.label },
                    });
                } else if (event.type === "plugin_progress") {
                    emit(task, {
                        ...base,
                        status: "RUNNING",
                        ...(event.percent !== undefined
                            ? { progress: event.percent }
                            : {}),
                        data: {
                            message: event.message,
                            ...(event.percent !== undefined
                                ? { progress: event.percent }
                                : {}),
                        },
                    });
                } else if (event.type === "model_download") {
                    const label =
                        [event.model, event.file].filter(Boolean).join(" · ") ||
                        event.pluginId;
                    const mb = (n: number) => Math.round(n / 1048576);
                    emit(task, {
                        ...base,
                        status: "RUNNING",
                        data: {
                            message:
                                event.total !== undefined
                                    ? `${label}: ${mb(event.loaded)}/${mb(event.total)} MB`
                                    : `${label}: ${mb(event.loaded)} MB`,
                        },
                    });
                }
            },
        })
            .then((result) => {
                onResult?.(request, result);
                if (result.status === "success") {
                    emit(task, {
                        ...base,
                        status: "COMPLETED",
                        data: result.outputs[ownNodeId] ?? {},
                    });
                } else if (result.status === "cancelled") {
                    emit(task, {
                        ...base,
                        status: "CANCELLED",
                        error: "cancelled",
                    });
                } else {
                    const error =
                        result.failures[0]?.summary ??
                        result.errors[0] ??
                        "Task failed";
                    emit(task, {
                        ...base,
                        status: "FAILED",
                        error,
                        data: { error },
                    });
                }
            })
            .catch((e: unknown) => {
                const error = e instanceof Error ? e.message : String(e);
                emit(task, {
                    ...base,
                    status: "FAILED",
                    error,
                    data: { error },
                });
            });
    };

    return {
        async createTask(request) {
            if (!handles(request)) return fallback.createTask(request);
            const taskId = `${ENGINE_TASK_PREFIX}${newId()}`;
            start(taskId, request);
            return { taskId };
        },
        waitTask(taskId, handlers) {
            const task = tasks.get(taskId);
            if (!task || !taskId.startsWith(ENGINE_TASK_PREFIX)) {
                return fallback.waitTask(taskId, handlers);
            }
            task.listeners.add(handlers);
            handlers.onOpen();
            for (const m of task.messages) handlers.onMessage(m);
            if (task.done) handlers.onClose();
            return { close: () => task.listeners.delete(handlers) };
        },
        async stopTask(taskId) {
            if (!isLocal(taskId)) return fallback.stopTask(taskId);
            const task = tasks.get(taskId);
            if (!task || task.done) return false;
            task.abort.abort();
            return true;
        },
        async updateTaskStatus(request) {
            if (!isLocal(request.taskId))
                return fallback.updateTaskStatus(request);
            // Nothing to persist: the task never reached the server.
            return { success: true, skipped: true };
        },
    };
}
