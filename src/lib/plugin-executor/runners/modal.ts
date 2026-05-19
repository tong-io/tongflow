import "server-only";

import { type ChildProcess, spawn } from "node:child_process";
import path, { delimiter } from "node:path";
import { FunctionTimeoutError, ModalClient } from "modal";
import { TaskStatus } from "@/constants/task-status";
import type { NodeSlot } from "@/generated/abi";
import {
    requireModalTokenEnv,
    resolvePython,
} from "@/lib/modal/deploy-workers";
import { convertAssetOutputsToFileRefs } from "@/lib/plugin-executor/convert-modal-output-fileref";
import {
    modalTerminateAfterTimeouts,
    recordModalDeployCache,
    recordModalDownloadCache,
    shouldSkipModalDeploy,
    shouldSkipModalDownload,
} from "@/lib/plugin-executor/modal-deploy-cache";
import {
    getModalPluginConfig,
    getPluginFileAbsolutePath,
} from "@/lib/plugins/plugins-registry.server";
import { logger } from "@/lib/logger";
import { notifyTask } from "@/lib/task/emitter";
import type { PluginExecRequest, PluginExecResult } from "../types";

/** `modal run download` — must not hang forever if CLI or Hub stalls */
const MODAL_DOWNLOAD_TIMEOUT_MS = parseEnvMs(
    process.env.MODAL_DOWNLOAD_TIMEOUT_MS,
    20 * 60 * 1000,
);
/** `modal deploy` — must not hang forever (was unbounded in catch / retry paths) */
const MODAL_DEPLOY_TIMEOUT_MS = parseEnvMs(
    process.env.MODAL_DEPLOY_TIMEOUT_MS,
    10 * 60 * 1000,
);
/** `call.get()` waiting for GPU work — cap cost if Modal keeps retrying / stalling */
const MODAL_CALL_GET_TIMEOUT_MS = parseEnvMs(
    process.env.MODAL_CALL_GET_TIMEOUT_MS,
    15 * 60 * 1000,
);

function parseEnvMs(raw: string | undefined, fallback: number): number {
    if (raw == null || raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Serialize deploy work per plugin (skip cache + modal deploy). */
const modalDeployChains = new Map<string, Promise<void>>();

function chainModalDeploy(
    pluginId: string,
    fn: () => Promise<void>,
): Promise<void> {
    const prev = modalDeployChains.get(pluginId) ?? Promise.resolve();
    const next = prev
        .then(fn, () => undefined)
        .finally(() => {
            if (modalDeployChains.get(pluginId) === next) {
                modalDeployChains.delete(pluginId);
            }
        });
    modalDeployChains.set(pluginId, next);
    return next;
}

async function runModalDeployPluginMaybeCached(
    pluginId: string,
    signal?: AbortSignal,
): Promise<void> {
    await chainModalDeploy(pluginId, async () => {
        if (await shouldSkipModalDeploy(pluginId)) return;
        await runModalDeployPlugin(pluginId, signal);
        await recordModalDeployCache(pluginId);
    });
}

async function runModalDownloadPluginMaybeCached(
    pluginId: string,
    signal?: AbortSignal,
): Promise<void> {
    if (await shouldSkipModalDownload(pluginId)) return;
    await runModalDownloadPlugin(pluginId, signal);
    await recordModalDownloadCache(pluginId);
}

function forwardSubprocessChunk(
    stream: NodeJS.WriteStream,
    prefix: string,
    chunk: Buffer,
): void {
    const text = chunk.toString("utf8");
    if (!text) return;
    // Preserve a trailing newline if present; prefix each line for grep-ability.
    const hadTrailingNewline = text.endsWith("\n");
    const body = hadTrailingNewline ? text.slice(0, -1) : text;
    const prefixed = body
        .split("\n")
        .map((line) => `${prefix} ${line}`)
        .join("\n");
    stream.write(hadTrailingNewline ? `${prefixed}\n` : prefixed);
}

let modalSdkTimeoutCancelStreak = 0;

function tailText(buf: Buffer, maxChars: number): string {
    const s = buf.toString("utf8").trim();
    if (!s) return "";
    if (s.length <= maxChars) return s;
    return s.slice(s.length - maxChars);
}

function abortPromise(signal: AbortSignal): Promise<never> {
    if (signal.aborted) return Promise.reject(new Error("Aborted"));
    return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Aborted")), {
            once: true,
        });
    });
}

type ModalFunctionCall = {
    get: (params?: { timeoutMs?: number }) => Promise<unknown>;
    cancel: (params?: { terminateContainers?: boolean }) => Promise<void>;
};

/**
 * `call.get()` with no `timeoutMs` can poll the control plane forever when no
 * terminal output arrives (e.g. remote retry loops) — always pass a cap.
 * User abort: soft cancel only. Repeated SDK timeouts: escalate `terminateContainers`.
 */
async function getModalCallResult(
    call: ModalFunctionCall,
    signal: AbortSignal,
    timeoutMs: number,
): Promise<unknown> {
    const threshold = modalTerminateAfterTimeouts();
    try {
        const result = await Promise.race([
            call.get({ timeoutMs }),
            abortPromise(signal),
        ]);
        modalSdkTimeoutCancelStreak = 0;
        return result;
    } catch (e) {
        if (e instanceof Error && e.message === "Aborted") {
            void call
                .cancel({ terminateContainers: false })
                .catch(() => undefined);
            throw e;
        }
        if (e instanceof FunctionTimeoutError) {
            modalSdkTimeoutCancelStreak += 1;
            const hard = modalSdkTimeoutCancelStreak >= threshold;
            void call
                .cancel({ terminateContainers: hard })
                .catch(() => undefined);
            throw e;
        }
        throw e;
    }
}

async function withTimeout<T>(
    p: Promise<T>,
    ms: number,
    label: string,
): Promise<T> {
    const t = setTimeout(() => {}, 0); // ensure Node timers module loaded
    clearTimeout(t);
    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms);
    });
    try {
        return await Promise.race([p, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Run `modal` CLI via subprocess with a **hard** wall-clock limit: on timeout or
 * `AbortSignal`, the child is SIGKILL'd so Tongflow cannot wait forever while
 * Modal / the CLI hangs or restart-loops.
 */
function runModalCli(
    label: string,
    args: string[],
    opts: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        timeoutMs: number;
        signal?: AbortSignal;
        pluginId: string;
    },
    python: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child: ChildProcess = spawn(python, args, {
            cwd: opts.cwd,
            env: opts.env,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const stderr: Buffer[] = [];
        const stdout: Buffer[] = [];
        const prefix = `[modal:${opts.pluginId} ${label}]`;
        child.stderr?.on("data", (d: Buffer) => {
            stderr.push(d);
            forwardSubprocessChunk(process.stderr, prefix, d);
        });
        child.stdout?.on("data", (d: Buffer) => {
            stdout.push(d);
            forwardSubprocessChunk(process.stdout, prefix, d);
        });

        let settled = false;
        const fail = (err: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            opts.signal?.removeEventListener("abort", onAbort);
            reject(err);
        };
        const ok = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            opts.signal?.removeEventListener("abort", onAbort);
            resolve();
        };

        const kill = () => {
            try {
                if (child.exitCode == null) child.kill("SIGKILL");
            } catch {
                /* ignore */
            }
        };

        const onAbort = () => {
            kill();
            fail(new Error(`Aborted: ${label}`));
        };

        const timer = setTimeout(() => {
            kill();
            fail(
                new Error(
                    `Timed out: ${label} (${opts.timeoutMs}ms) — modal CLI subprocess was killed`,
                ),
            );
        }, opts.timeoutMs);

        if (opts.signal) {
            if (opts.signal.aborted) {
                onAbort();
                return;
            }
            opts.signal.addEventListener("abort", onAbort, { once: true });
        }

        child.on("error", (e) => {
            kill();
            fail(e instanceof Error ? e : new Error(String(e)));
        });
        child.on("exit", (code) => {
            if (settled) return;
            if (code === 0) ok();
            else {
                const err = Buffer.concat(stderr);
                const out = Buffer.concat(stdout);
                const detail = tailText(err, 4000) || tailText(out, 4000);
                fail(
                    new Error(
                        `${label} failed (exit ${code})${detail ? `: ${detail}` : ""}`,
                    ),
                );
            }
        });
    });
}

function pythonEnvWithTongflow(): NodeJS.ProcessEnv {
    const tongflowSdkDir = path.join(process.cwd(), "sdk");
    const pythonPathParts = [
        tongflowSdkDir,
        process.env.PYTHONPATH?.trim(),
    ].filter((x): x is string => Boolean(x));
    return {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(delimiter),
    };
}

async function runModalDeployPlugin(
    pluginId: string,
    signal?: AbortSignal,
): Promise<void> {
    requireModalTokenEnv();
    const cfg = getModalPluginConfig(pluginId);
    if (!cfg) throw new Error(`Unknown plugin: ${pluginId}`);
    const deployFile = getPluginFileAbsolutePath(pluginId, cfg.deployFile);
    if (!deployFile)
        throw new Error(`Missing deploy file for plugin: ${pluginId}`);
    const python = await resolvePython();
    await runModalCli(
        "modal deploy",
        ["-m", "modal", "deploy", deployFile],
        {
            cwd: path.dirname(deployFile),
            env: pythonEnvWithTongflow(),
            timeoutMs: MODAL_DEPLOY_TIMEOUT_MS,
            signal,
            pluginId,
        },
        python,
    );
}

async function runModalDownloadPlugin(
    pluginId: string,
    signal?: AbortSignal,
): Promise<void> {
    requireModalTokenEnv();
    const cfg = getModalPluginConfig(pluginId);
    if (!cfg) throw new Error(`Unknown plugin: ${pluginId}`);
    const downloadFile = getPluginFileAbsolutePath(pluginId, cfg.downloadFile);
    if (!downloadFile)
        throw new Error(`Missing download file for plugin: ${pluginId}`);
    const python = await resolvePython();
    await runModalCli(
        "modal run download",
        ["-m", "modal", "run", `${downloadFile}::download`],
        {
            cwd: path.dirname(downloadFile),
            env: pythonEnvWithTongflow(),
            timeoutMs: MODAL_DOWNLOAD_TIMEOUT_MS,
            signal,
            pluginId,
        },
        python,
    );
}

function looksLikeModalMethodMissing(err: unknown): boolean {
    const m =
        err instanceof Error ? err.message : typeof err === "string" ? err : "";
    if (!m) return false;
    const lower = m.toLowerCase();
    return lower.includes("not found") && lower.includes("method");
}

function ensureModalObjectResult<S extends NodeSlot>(
    raw: unknown,
): PluginExecResult<S> {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Plugin returned invalid result");
    }
    return raw as PluginExecResult<S>;
}

export async function execModalPlugin<S extends NodeSlot>(
    req: PluginExecRequest<S>,
): Promise<PluginExecResult<S>> {
    // Asset bytes are already inlined upstream by `prepareAssetInput` in
    // `task-runner`; the modal runner just forwards the ABI-shaped payload.
    const input = req.input as unknown as Record<string, unknown>;

    const cfg = getModalPluginConfig(req.pluginId);
    if (!cfg) throw new Error(`Unknown plugin: ${req.pluginId}`);
    const slotCfg = cfg.methodsByNodeSlot[req.nodeSlot];
    const methodName = slotCfg?.methodName;
    const clsName = slotCfg?.clsName ?? cfg.clsName;
    if (!methodName) {
        throw new Error(
            `Plugin ${req.pluginId} does not implement nodeSlot=${req.nodeSlot}`,
        );
    }

    const stage = (message: string) => {
        // nodeId is optional here; SSE consumers still receive RUNNING updates.
        logger.info(`[modal:${req.pluginId}] ${message}`);
        notifyTask(req.taskId, TaskStatus.RUNNING, { message });
    };

    // Ensure weights + deployment are ready (idempotent in plugins).
    // Subprocess has its own wall-clock cap + SIGKILL; pass signal for user cancel.
    stage(`Modal: downloading (${req.pluginId})`);
    await runModalDownloadPluginMaybeCached(req.pluginId, req.signal);

    // Dev: deploy when repo fingerprint changed or working tree dirty (see modal-deploy-cache).
    if (process.env.NODE_ENV !== "production") {
        stage(`Modal: deploying (dev refresh) (${req.pluginId})`);
        await runModalDeployPluginMaybeCached(req.pluginId, req.signal);
    }
    try {
        stage(`Modal: checking deployment (${cfg.appName}/${clsName})`);
        const client = new ModalClient();
        await withTimeout(
            Promise.race([
                client.cls.fromName(cfg.appName, clsName),
                abortPromise(req.signal),
            ]),
            60 * 1000,
            "modal cls.fromName",
        );
    } catch {
        // Previously unbounded — could wait forever if `modal deploy` never exited.
        stage(`Modal: deploying (${req.pluginId})`);
        await runModalDeployPluginMaybeCached(req.pluginId, req.signal);
    }

    const invoke = async () => {
        stage(`Modal: invoking ${methodName}()`);
        const client = new ModalClient();
        const cls = await withTimeout(
            Promise.race([
                client.cls.fromName(cfg.appName, clsName),
                abortPromise(req.signal),
            ]),
            60 * 1000,
            "modal cls.fromName (invoke)",
        );
        const instance = await withTimeout(
            Promise.race([cls.instance(), abortPromise(req.signal)]),
            60 * 1000,
            "modal cls.instance",
        );
        const method = instance.method(methodName);
        const call = await withTimeout(
            Promise.race([method.spawn([input]), abortPromise(req.signal)]),
            60 * 1000,
            "modal method.spawn",
        );
        return await getModalCallResult(
            call,
            req.signal,
            MODAL_CALL_GET_TIMEOUT_MS,
        );
    };

    let out: unknown;
    try {
        out = await invoke();
    } catch (e) {
        if (looksLikeModalMethodMissing(e)) {
            await runModalDeployPluginMaybeCached(req.pluginId, req.signal);
            out = await invoke();
        } else {
            throw e;
        }
    }

    const converted = await convertAssetOutputsToFileRefs(
        req.nodeSlot,
        out,
        req.taskId,
    );
    return ensureModalObjectResult<S>(converted);
}
