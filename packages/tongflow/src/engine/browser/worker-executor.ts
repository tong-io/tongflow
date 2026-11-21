/**
 * The edge executor: runs each browser plugin in its own dedicated module Web
 * Worker and talks to it with the protocol in `../worker/protocol.ts`.
 *
 * One worker per plugin, created on first use and reused (a loaded model stays
 * warm across nodes and runs); several invocations may be in flight on it.
 * The host decides where plugin files are served from (`resolveModuleUrl`),
 * typically same-origin so the worker can load them.
 */

import type { PluginConfig } from "../../core/registry/plugins-registry-schema";
import {
    type ExecutorRegistry,
    resolveEdgeTarget,
    splitPrompt,
} from "../executors/edge-target";
import type {
    ExecutorProgress,
    InvokeRequest,
    InvokeTarget,
    NodeExecutor,
} from "../types";
import type {
    EdgeInvokeMessage,
    HostToWorkerMessage,
    WorkerToHostMessage,
} from "../worker/protocol";

/** The slice of `Worker` the executor uses. */
export interface WorkerLike {
    postMessage(message: unknown): void;
    addEventListener(
        type: "message",
        listener: (e: { data: unknown }) => void,
    ): void;
    addEventListener(
        type: "error",
        listener: (e: { message?: string }) => void,
    ): void;
    terminate(): void;
}

export interface WorkerEdgeExecutorOptions {
    registry: ExecutorRegistry;
    /** URL of a plugin's ESM entry (`plugin.entryFile` under `plugin.localSubdir`), as the host serves it. */
    resolveModuleUrl: (pluginId: string, plugin: PluginConfig) => string | URL;
    /** Default: `new Worker(url, { type: "module", name: pluginId })`. */
    createWorker?: (url: string | URL, pluginId: string) => WorkerLike;
    /**
     * Terminate a plugin's worker when one of its invocations is cancelled,
     * for plugins that cannot stop mid-call. Default `false` (the worker gets
     * a `cancel` message and stays warm).
     */
    terminateOnAbort?: boolean;
}

export interface WorkerEdgeExecutor extends NodeExecutor {
    /** Terminate every plugin worker. */
    dispose(): void;
}

interface Pending {
    resolve: (output: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    onProgress: (p: ExecutorProgress) => void;
}

function abortError(): Error {
    const e = new Error("The operation was aborted.");
    e.name = "AbortError";
    return e;
}

class PluginWorker {
    readonly ready: Promise<string[]>;
    private readonly pending = new Map<number, Pending>();
    private nextId = 1;
    private dead: Error | null = null;

    constructor(
        private readonly worker: WorkerLike,
        private readonly pluginId: string,
        url: string,
        private readonly onDead: () => void,
    ) {
        let readyResolve!: (methods: string[]) => void;
        let readyReject!: (e: Error) => void;
        this.ready = new Promise((res, rej) => {
            readyResolve = res;
            readyReject = rej;
        });
        // A load failure surfaces as a rejected `ready`; keep it from being
        // reported as unhandled before an invoke awaits it.
        this.ready.catch(() => {});

        worker.addEventListener("message", (event) => {
            const msg = event.data as WorkerToHostMessage;
            if (msg?.type === "ready") {
                readyResolve(Array.isArray(msg.methods) ? msg.methods : []);
                return;
            }
            const p =
                typeof (msg as { id?: unknown })?.id === "number"
                    ? this.pending.get((msg as { id: number }).id)
                    : undefined;
            if (!p) return;
            switch (msg.type) {
                case "progress":
                    p.onProgress({
                        kind: "progress",
                        message: msg.message,
                        ...(msg.percent !== undefined
                            ? { percent: msg.percent }
                            : {}),
                    });
                    break;
                case "model-download": {
                    const { type: _t, id: _id, ...rest } = msg;
                    p.onProgress({ kind: "model-download", ...rest });
                    break;
                }
                case "result":
                    this.pending.delete(msg.id);
                    p.resolve(msg.output as Record<string, unknown>);
                    break;
                case "error": {
                    this.pending.delete(msg.id);
                    const err = new Error(msg.message);
                    if (msg.name && msg.name !== "Error") err.name = msg.name;
                    p.reject(err);
                    break;
                }
            }
        });
        worker.addEventListener("error", (event) => {
            const err = new Error(
                `Edge plugin ${pluginId} worker failed (${url}): ${event?.message || "load or runtime error"}`,
            );
            readyReject(err);
            this.kill(err);
        });
    }

    get isDead(): boolean {
        return this.dead !== null;
    }

    kill(err: Error): void {
        if (this.dead) return;
        this.dead = err;
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
        this.worker.terminate();
        this.onDead();
    }

    call(
        msg: Omit<EdgeInvokeMessage, "type" | "id">,
        signal: AbortSignal,
        onProgress: (p: ExecutorProgress) => void,
        terminateOnAbort: boolean,
    ): Promise<Record<string, unknown>> {
        if (this.dead) return Promise.reject(this.dead);
        if (signal.aborted) return Promise.reject(abortError());
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                if (!this.pending.delete(id)) return;
                reject(abortError());
                if (terminateOnAbort) {
                    this.kill(
                        new Error(
                            `Edge plugin ${this.pluginId} was terminated`,
                        ),
                    );
                } else {
                    this.post({ type: "cancel", id });
                }
            };
            signal.addEventListener("abort", onAbort, { once: true });
            const done = () => signal.removeEventListener("abort", onAbort);
            this.pending.set(id, {
                resolve: (v) => {
                    done();
                    resolve(v);
                },
                reject: (e) => {
                    done();
                    reject(e);
                },
                onProgress,
            });
            this.post({ type: "invoke", id, ...msg });
        });
    }

    private post(msg: HostToWorkerMessage): void {
        this.worker.postMessage(msg);
    }
}

export function createWorkerEdgeExecutor(
    options: WorkerEdgeExecutorOptions,
): WorkerEdgeExecutor {
    const workers = new Map<string, PluginWorker>();
    const createWorker =
        options.createWorker ??
        ((url: string | URL, pluginId: string): WorkerLike =>
            new Worker(url, { type: "module", name: pluginId }));

    const workerFor = (pluginId: string, plugin: PluginConfig) => {
        const existing = workers.get(pluginId);
        if (existing && !existing.isDead) return existing;
        const url = options.resolveModuleUrl(pluginId, plugin);
        const pw = new PluginWorker(
            createWorker(url, pluginId),
            pluginId,
            String(url),
            () => {
                if (workers.get(pluginId) === pw) workers.delete(pluginId);
            },
        );
        workers.set(pluginId, pw);
        return pw;
    };

    return {
        check(target: InvokeTarget) {
            resolveEdgeTarget(options.registry, target);
        },
        async invoke(req: InvokeRequest) {
            const { plugin, method } = resolveEdgeTarget(options.registry, req);
            const pw = workerFor(req.pluginId, plugin);
            const methods = await pw.ready;
            if (!methods.includes(method)) {
                throw new Error(
                    `Edge plugin ${req.pluginId} has no method '${method}' (nodeSlot=${req.nodeSlot}); it exports: ${methods.join(", ") || "none"}.`,
                );
            }
            const { input, params } = splitPrompt(req.prompt);
            return pw.call(
                {
                    method,
                    nodeSlot: req.nodeSlot,
                    input,
                    ...(req.model ? { model: req.model } : {}),
                    ...(params ? { params } : {}),
                },
                req.signal,
                req.onProgress,
                options.terminateOnAbort ?? false,
            );
        },
        dispose() {
            for (const pw of [...workers.values()]) {
                pw.kill(new Error("Edge executor disposed"));
            }
            workers.clear();
        },
    };
}
