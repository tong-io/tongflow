import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { ModalClient } from "modal";
import { getModalPluginConfig, getPluginFileAbsolutePath } from "@/lib/plugins-registry.server";
import { requireModalTokenEnv, resolvePython } from "@/lib/modal-deploy-workers";
import { saveFile } from "@/handlers/file-utils";
import { notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";
import type { PluginExecRequest, PluginExecResult } from "../types";

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

async function runModalDeployPlugin(pluginId: string): Promise<void> {
    requireModalTokenEnv();
    const cfg = getModalPluginConfig(pluginId);
    if (!cfg) throw new Error(`Unknown plugin: ${pluginId}`);
    const deployFile = getPluginFileAbsolutePath(pluginId, cfg.deployFile);
    if (!deployFile) throw new Error(`Missing deploy file for plugin: ${pluginId}`);
    const python = await resolvePython();
    await new Promise<void>((resolve, reject) => {
        const child = spawn(python, ["-m", "modal", "deploy", deployFile], {
            cwd: path.dirname(deployFile),
            env: process.env,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const stderr: Buffer[] = [];
        const stdout: Buffer[] = [];
        child.stderr?.on("data", (d: Buffer) => stderr.push(d));
        child.stdout?.on("data", (d: Buffer) => stdout.push(d));
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) resolve();
            else {
                const err = Buffer.concat(stderr);
                const out = Buffer.concat(stdout);
                const detail = tailText(err, 4000) || tailText(out, 4000);
                reject(
                    new Error(
                        `modal deploy failed (${code})${detail ? `: ${detail}` : ""}`,
                    ),
                );
            }
        });
    });
}

async function runModalDownloadPlugin(pluginId: string): Promise<void> {
    requireModalTokenEnv();
    const cfg = getModalPluginConfig(pluginId);
    if (!cfg) throw new Error(`Unknown plugin: ${pluginId}`);
    const downloadFile = getPluginFileAbsolutePath(pluginId, cfg.downloadFile);
    if (!downloadFile) throw new Error(`Missing download file for plugin: ${pluginId}`);
    const python = await resolvePython();
    await new Promise<void>((resolve, reject) => {
        const child = spawn(
            python,
            ["-m", "modal", "run", `${downloadFile}::download`],
            {
                cwd: path.dirname(downloadFile),
                env: process.env,
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        const stderr: Buffer[] = [];
        const stdout: Buffer[] = [];
        child.stderr?.on("data", (d: Buffer) => stderr.push(d));
        child.stdout?.on("data", (d: Buffer) => stdout.push(d));
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) resolve();
            else {
                const err = Buffer.concat(stderr);
                const out = Buffer.concat(stdout);
                const detail = tailText(err, 4000) || tailText(out, 4000);
                reject(
                    new Error(
                        `modal run download failed (${code})${detail ? `: ${detail}` : ""}`,
                    ),
                );
            }
        });
    });
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

async function persistImageBase64IfPresent(
    raw: unknown,
    taskId: string,
): Promise<PluginExecResult> {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Plugin returned invalid result");
    }
    const out = { ...(raw as Record<string, unknown>) };
    const b64 = out["image_base64"];
    if (out["success"] === false || typeof b64 !== "string" || b64.length === 0) {
        return out as PluginExecResult;
    }
    const buf = Buffer.from(b64, "base64");
    const fileKey = await saveFile(buf, "png", taskId);
    const next: Record<string, unknown> = { ...out, success: true, file_key: fileKey };
    delete next["image_base64"];
    return next as PluginExecResult;
}

export async function execModalPlugin(
    req: PluginExecRequest,
): Promise<PluginExecResult> {
    const cfg = getModalPluginConfig(req.pluginId);
    if (!cfg) throw new Error(`Unknown plugin: ${req.pluginId}`);
    const methodName = cfg.methodsByNodeSlot[req.nodeSlot]?.methodName;
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
    stage(`Modal: downloading (${req.pluginId})`);
    await withTimeout(
        Promise.race([runModalDownloadPlugin(req.pluginId), abortPromise(req.signal)]),
        20 * 60 * 1000,
        "modal download",
    );

    // In dev, always deploy to avoid stale Modal deployments during rapid iteration.
    if (process.env.NODE_ENV !== "production") {
        stage(`Modal: deploying (dev refresh) (${req.pluginId})`);
        await withTimeout(
            Promise.race([runModalDeployPlugin(req.pluginId), abortPromise(req.signal)]),
            10 * 60 * 1000,
            "modal deploy (dev refresh)",
        );
    }
    try {
        stage(`Modal: checking deployment (${cfg.appName}/${cfg.clsName})`);
        const client = new ModalClient();
        await withTimeout(
            Promise.race([client.cls.fromName(cfg.appName, cfg.clsName), abortPromise(req.signal)]),
            60 * 1000,
            "modal cls.fromName",
        );
    } catch {
        stage(`Modal: deploying (${req.pluginId})`);
        await runModalDeployPlugin(req.pluginId);
    }

    const invoke = async () => {
        stage(`Modal: invoking ${methodName}()`);
        const client = new ModalClient();
        const cls = await withTimeout(
            Promise.race([client.cls.fromName(cfg.appName, cfg.clsName), abortPromise(req.signal)]),
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
            Promise.race([method.spawn([req.input]), abortPromise(req.signal)]),
            60 * 1000,
            "modal method.spawn",
        );
        return await withTimeout(
            Promise.race([call.get(), abortPromise(req.signal)]),
            15 * 60 * 1000,
            "modal call.get",
        );
    };

    let out: unknown;
    try {
        out = await invoke();
    } catch (e) {
        if (looksLikeModalMethodMissing(e)) {
            await runModalDeployPlugin(req.pluginId);
            out = await invoke();
        } else {
            throw e;
        }
    }

    return await persistImageBase64IfPresent(out, req.taskId);
}

