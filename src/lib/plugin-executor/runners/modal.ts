import "server-only";

import { type ChildProcess, spawn } from "node:child_process";
import path, { delimiter } from "node:path";
import { FunctionTimeoutError, ModalClient } from "modal";
import { embedLocalUploadsForModal } from "@/lib/plugin-executor/embed-local-uploads-for-modal.server";
import { getModalPluginConfig, getPluginFileAbsolutePath } from "@/lib/plugins-registry.server";
import { requireModalTokenEnv, resolvePython } from "@/lib/modal-deploy-workers";
import { saveFile } from "@/utils/file-utils";
import { notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";
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

function tailText(buf: Buffer, maxChars: number): string {
    const s = buf.toString("utf8").trim();
    if (!s) return "";
    if (s.length <= maxChars) return s;
    return s.slice(s.length - maxChars);
}

function abortPromise(signal: AbortSignal): Promise<never> {
    if (signal.aborted) return Promise.reject(new Error("Aborted"));
    return new Promise((_, reject) => {
        signal.addEventListener(
            "abort",
            () => reject(new Error("Aborted")),
            { once: true },
        );
    });
}

type ModalFunctionCall = {
    get: (params?: { timeoutMs?: number }) => Promise<unknown>;
    cancel: (params?: { terminateContainers?: boolean }) => Promise<void>;
};

/**
 * `call.get()` with no `timeoutMs` can poll the control plane forever when no
 * terminal output arrives (e.g. remote retry loops) — always pass a cap.
 * On abort or SDK get-timeout, `cancel(terminateContainers)` so Modal does not
 * keep runners alive while the client has already given up.
 */
async function getModalCallResult(
    call: ModalFunctionCall,
    signal: AbortSignal,
    timeoutMs: number,
): Promise<unknown> {
    const terminate = () =>
        void call.cancel({ terminateContainers: true }).catch(() => undefined);
    try {
        return await Promise.race([call.get({ timeoutMs }), abortPromise(signal)]);
    } catch (e) {
        if (e instanceof Error) {
            if (e.message === "Aborted") {
                terminate();
            } else if (e instanceof FunctionTimeoutError) {
                terminate();
            }
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
 * `AbortSignal`, the child is SIGKILL'd so Openflow cannot wait forever while
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
        child.stderr?.on("data", (d: Buffer) => stderr.push(d));
        child.stdout?.on("data", (d: Buffer) => stdout.push(d));

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
    const tongflowSdkDir = path.join(process.cwd(), "plugins", "tongflow");
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
    if (!deployFile) throw new Error(`Missing deploy file for plugin: ${pluginId}`);
    const python = await resolvePython();
    await runModalCli(
        "modal deploy",
        ["-m", "modal", "deploy", deployFile],
        {
            cwd: path.dirname(deployFile),
            env: pythonEnvWithTongflow(),
            timeoutMs: MODAL_DEPLOY_TIMEOUT_MS,
            signal,
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
    if (!downloadFile) throw new Error(`Missing download file for plugin: ${pluginId}`);
    const python = await resolvePython();
    await runModalCli(
        "modal run download",
        ["-m", "modal", "run", `${downloadFile}::download`],
        {
            cwd: path.dirname(downloadFile),
            env: pythonEnvWithTongflow(),
            timeoutMs: MODAL_DOWNLOAD_TIMEOUT_MS,
            signal,
        },
        python,
    );
}

function looksLikeModalMethodMissing(err: unknown): boolean {
    const m =
        err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "";
    if (!m) return false;
    const lower = m.toLowerCase();
    return lower.includes("not found") && lower.includes("method");
}

function bufferFromModalBytes(v: unknown): Buffer | null {
    if (v == null) return null;
    if (Buffer.isBuffer(v)) return v;
    if (v instanceof Uint8Array) return Buffer.from(v);
    if (typeof v === "string" && v.length > 0) {
        // Modal / JSON may deliver raw base64 for byte fields
        return Buffer.from(v, "base64");
    }
    return null;
}

async function persistBase64AssetIfPresent(
    raw: unknown,
    taskId: string,
): Promise<PluginExecResult> {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Plugin returned invalid result");
    }
    const out = { ...(raw as Record<string, unknown>) };
    if (out["success"] === false) return out as PluginExecResult;

    /** e.g. separate_video_audio: [video bytes, audio bytes] — before single `output_bytes` */
    const outputsRawFirst = out["outputs"];
    if (Array.isArray(outputsRawFirst) && outputsRawFirst.length >= 2) {
        const keys: string[] = [];
        for (const item of outputsRawFirst) {
            if (item == null || typeof item !== "object" || Array.isArray(item)) {
                continue;
            }
            const rec = item as Record<string, unknown>;
            const ob = bufferFromModalBytes(rec["output_bytes"]);
            const extRaw = rec["output_ext"];
            if (!ob || ob.length === 0) continue;
            const ext =
                typeof extRaw === "string" && extRaw.length > 0
                    ? extRaw.replace(/^\./, "")
                    : "bin";
            keys.push(await saveFile(ob, ext, taskId));
        }
        if (keys.length >= 2) {
            const next: Record<string, unknown> = {
                ...out,
                success: true,
                video_file_key: keys[0],
                audio_file_key: keys[1],
                file_keys: keys,
            };
            delete next["outputs"];
            return next as PluginExecResult;
        }
    }

    /** CPU plugins (e.g. tongflow-modal-cpu-ffmpeg) return { output_bytes, output_ext } */
    const outBytes = bufferFromModalBytes(out["output_bytes"]);
    const outExtRaw = out["output_ext"];
    if (outBytes && outBytes.length > 0) {
        const ext =
            typeof outExtRaw === "string" && outExtRaw.length > 0
                ? outExtRaw.replace(/^\./, "")
                : "bin";
        const fileKey = await saveFile(outBytes, ext, taskId);
        const next: Record<string, unknown> = {
            ...out,
            success: true,
            file_key: fileKey,
        };
        delete next["output_bytes"];
        delete next["output_ext"];
        return next as PluginExecResult;
    }

    const pick = (
        key: "image_base64" | "video_base64" | "audio_base64",
        ext: "png" | "mp4" | "wav",
    ): { key: string; ext: "png" | "mp4" | "wav"; b64: string } | null => {
        const v = out[key];
        if (typeof v !== "string" || v.length === 0) return null;
        return { key, ext, b64: v };
    };

    const found =
        pick("image_base64", "png") ??
        pick("video_base64", "mp4") ??
        pick("audio_base64", "wav");
    if (!found) return out as PluginExecResult;

    const buf = Buffer.from(found.b64, "base64");
    const fileKey = await saveFile(buf, found.ext, taskId);
    const next: Record<string, unknown> = {
        ...out,
        success: true,
        file_key: fileKey,
    };
    delete next[found.key];
    return next as PluginExecResult;
}

export async function execModalPlugin(
    req: PluginExecRequest,
): Promise<PluginExecResult> {
    const input = await embedLocalUploadsForModal(req.input, {
        nodeSlot: req.nodeSlot,
    });

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
        notifyTask(req.taskId, TaskStatus.RUNNING, { message });
    };

    // Ensure weights + deployment are ready (idempotent in plugins).
    // Subprocess has its own wall-clock cap + SIGKILL; pass signal for user cancel.
    stage(`Modal: downloading (${req.pluginId})`);
    await runModalDownloadPlugin(req.pluginId, req.signal);

    // In dev, always deploy to avoid stale Modal deployments during rapid iteration.
    if (process.env.NODE_ENV !== "production") {
        stage(`Modal: deploying (dev refresh) (${req.pluginId})`);
        await runModalDeployPlugin(req.pluginId, req.signal);
    }
    try {
        stage(`Modal: checking deployment (${cfg.appName}/${clsName})`);
        const client = new ModalClient();
        await withTimeout(
            Promise.race([client.cls.fromName(cfg.appName, clsName), abortPromise(req.signal)]),
            60 * 1000,
            "modal cls.fromName",
        );
    } catch {
        // Previously unbounded — could wait forever if `modal deploy` never exited.
        stage(`Modal: deploying (${req.pluginId})`);
        await runModalDeployPlugin(req.pluginId, req.signal);
    }

    const invoke = async () => {
        stage(`Modal: invoking ${methodName}()`);
        const client = new ModalClient();
        const cls = await withTimeout(
            Promise.race([client.cls.fromName(cfg.appName, clsName), abortPromise(req.signal)]),
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
        return await getModalCallResult(call, req.signal, MODAL_CALL_GET_TIMEOUT_MS);
    };

    let out: unknown;
    try {
        out = await invoke();
    } catch (e) {
        if (looksLikeModalMethodMissing(e)) {
            await runModalDeployPlugin(req.pluginId, req.signal);
            out = await invoke();
        } else {
            throw e;
        }
    }

    return await persistBase64AssetIfPresent(out, req.taskId);
}

