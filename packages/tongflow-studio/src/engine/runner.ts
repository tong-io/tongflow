/**
 * Spawn `python -m tongflow engine` for one workflow run and translate its
 * NDJSON stream into typed events. Mirrors the TongFlow app's
 * `engine-delegate.server.ts`, minus the DB/SSE shell.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ExecutableWorkflow } from "tongflow";
import type { RunEvent } from "../shared/types.ts";
import { nowIso } from "../util/fsx.ts";

export interface EngineOptions {
    plugins_dir: string;
    data_dir: string;
    out_dir: string;
    abi_path?: string;
    file_key_base: string;
    inline_outputs: false;
    auto_install: boolean;
    org: string;
    plugin_git_urls?: Record<string, string>;
    task_id: string;
    env?: Record<string, string>;
}

export interface EngineRequest {
    workflow: ExecutableWorkflow;
    inputs: Record<string, unknown>;
    options: EngineOptions;
}

export interface EngineResult {
    status: "success" | "failed";
    outputs: Record<string, unknown>;
    outputs_by_name: Record<string, string[]>;
    errors: string[];
    failures: { nodeId: string; summary: string }[];
}

export interface RunEngineOptions {
    python: string;
    request: EngineRequest;
    signal?: AbortSignal;
    onEvent?: (event: RunEvent) => void;
    /** Extra environment for the engine process itself (inherited by plugin subprocesses). */
    env?: Record<string, string>;
    cwd?: string;
}

export class EngineError extends Error {
    constructor(
        message: string,
        readonly stderr: string,
    ) {
        super(message);
        this.name = "EngineError";
    }
}

/** Run the engine to completion; resolves with the final result or throws EngineError. */
export function runEngine(options: RunEngineOptions): Promise<EngineResult> {
    const { python, request, signal, onEvent = () => undefined } = options;
    return new Promise<EngineResult>((resolve, reject) => {
        const child = spawn(python, ["-m", "tongflow", "engine"], {
            cwd: options.cwd,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: "1",
                ...(options.env ?? {}),
            },
            stdio: ["pipe", "pipe", "pipe"],
        });
        let stderr = "";
        let result: EngineResult | undefined;
        let fatal: string | undefined;
        let settled = false;

        const abort = () => {
            if (settled) return;
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 5000).unref();
        };
        signal?.addEventListener("abort", abort, { once: true });

        child.stderr.on("data", (chunk: Buffer) => {
            stderr = (stderr + chunk.toString()).slice(-16000);
        });
        const rl = createInterface({ input: child.stdout });
        rl.on("line", (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            let msg: Record<string, unknown>;
            try {
                msg = JSON.parse(trimmed) as Record<string, unknown>;
            } catch {
                onEvent({ type: "log", at: nowIso(), message: trimmed });
                return;
            }
            if ("ready" in msg) return;
            if ("event" in msg && msg.event && typeof msg.event === "object") {
                onEvent(translateEvent(msg.event as Record<string, unknown>));
                return;
            }
            if ("result" in msg) {
                result = msg.result as EngineResult;
                return;
            }
            if ("error" in msg) {
                fatal = String(msg.error);
            }
        });
        child.on("error", (error) => {
            settled = true;
            signal?.removeEventListener("abort", abort);
            reject(
                new EngineError(
                    `failed to start the tongflow engine: ${error.message}`,
                    stderr,
                ),
            );
        });
        child.on("close", (code) => {
            settled = true;
            signal?.removeEventListener("abort", abort);
            if (signal?.aborted) {
                reject(new EngineError("run cancelled", stderr));
                return;
            }
            if (result) {
                resolve(result);
                return;
            }
            const reason =
                fatal ??
                (code === 0
                    ? "engine exited without a result"
                    : `engine exited with code ${code}`);
            reject(
                new EngineError(
                    `${reason}${stderr ? `\n${lastLines(stderr, 12)}` : ""}`,
                    stderr,
                ),
            );
        });
        child.stdin.write(JSON.stringify(request));
        child.stdin.end();
    });
}

function lastLines(text: string, n: number): string {
    return text.trim().split(/\r?\n/).slice(-n).join("\n");
}

function translateEvent(e: Record<string, unknown>): RunEvent {
    const type = String(e.type ?? "log") as RunEvent["type"];
    const out: RunEvent = { type, at: nowIso() };
    if (typeof e.nodeId === "string") out.nodeId = e.nodeId;
    if (typeof e.label === "string") out.label = e.label;
    if (typeof e.feature === "string") out.feature = e.feature;
    if (typeof e.level === "number") out.level = e.level;
    if (typeof e.message === "string") out.message = e.message;
    if (typeof e.percent === "number") out.percent = e.percent;
    if (typeof e.error === "string") out.error = e.error;
    if (typeof e.totalNodes === "number") out.totalNodes = e.totalNodes;
    if (typeof e.levels === "number") out.levels = e.levels;
    if (
        type === "plugin_progress" &&
        !out.nodeId &&
        typeof e.pluginId === "string"
    ) {
        out.label = String(e.pluginId);
    }
    if (type === "workflow_failed" && Array.isArray(e.errors) && !out.error) {
        out.error = (e.errors as unknown[]).map(String).join("; ");
    }
    return out;
}
