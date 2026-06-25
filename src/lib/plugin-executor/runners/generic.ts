import "server-only";

import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { TaskStatus } from "@/constants/task-status";
import type { NodeSlot } from "@/generated/abi";
import { ensurePluginPython } from "@/lib/plugins/plugin-python-env.server";
import { getPluginConfig } from "@/lib/plugins/plugins-registry.server";
import { PYTHON_UTF8_ENV } from "@/lib/plugins/python-lite";
import { pluginsDir, resourcesDir } from "@/lib/runtime/paths.server";
import { withStoredEnv } from "@/lib/settings/env-store.server";
import { notifyTask } from "@/lib/task/emitter";
import { parseProgressLine } from "../progress-protocol";
import type { PluginExecRequest, PluginExecResult } from "../types";

function tryParseAbiOutput(stdout: string): Record<string, unknown> | null {
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // fall through
    }
    return null;
}

export async function execPlugin<S extends NodeSlot>(
    req: PluginExecRequest<S>,
): Promise<PluginExecResult<S>> {
    const cfg = getPluginConfig(req.pluginId);
    if (!cfg) throw new Error(`Unknown plugin: ${req.pluginId}`);

    const method = cfg.methodsByNodeSlot[req.nodeSlot];
    if (!method) {
        throw new Error(
            `Plugin ${req.pluginId} does not implement nodeSlot=${req.nodeSlot}`,
        );
    }

    const prompt = req.input as unknown as Record<string, unknown>;

    const pluginDir = join(pluginsDir(), cfg.localSubdir);
    // Every plugin ships its own local entry.py (`python entry.py`). For a
    // deploy-first plugin (needsDeploy) that entry.py is a thin bridge that
    // deploys once and invokes the remote backend.
    const entryArgs = [cfg.entryFile || "entry.py"];
    // Provision the shared plugin venv (SDK + this plugin's requirements.txt)
    // and run the entry with it. Falls back to a bare interpreter on failure.
    const python = await ensurePluginPython(req.pluginId, pluginDir);
    const tongflowSdkDir = join(resourcesDir(), "sdk");
    const pythonPathParts = [
        tongflowSdkDir,
        process.env.PYTHONPATH?.trim(),
    ].filter((x): x is string => Boolean(x));
    const pythonEnv = withStoredEnv({
        ...PYTHON_UTF8_ENV,
        PYTHONPATH: pythonPathParts.join(delimiter),
    });

    const payload = {
        pluginId: req.pluginId,
        nodeSlot: req.nodeSlot,
        taskId: req.taskId,
        prompt,
    };

    return await new Promise<PluginExecResult<S>>((resolve, reject) => {
        const child = spawn(python, entryArgs, {
            cwd: pluginDir,
            env: pythonEnv,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdoutBuf = "";
        let stderrText = "";
        // Line buffer for stderr so we can split out sentinel-framed progress
        // lines from ordinary log output.
        let stderrLineBuf = "";

        const handleStderrLine = (line: string) => {
            const progress = parseProgressLine(line);
            if (progress) {
                notifyTask(req.taskId, TaskStatus.RUNNING, {
                    message: progress.message,
                    ...(progress.percent != null
                        ? { percent: progress.percent }
                        : {}),
                });
                return;
            }
            // Ordinary log line: keep for crash diagnostics and forward to the
            // server terminal in real time.
            stderrText += `${line}\n`;
            process.stderr.write(
                `[plugin:${req.pluginId}/${req.nodeSlot}] ${line}\n`,
            );
        };

        const fail = (err: unknown) => {
            try {
                child.kill();
            } catch {
                // ignore
            }
            reject(err);
        };

        req.signal.addEventListener(
            "abort",
            () => {
                try {
                    child.kill();
                } catch {
                    // ignore
                }
                reject(new Error("Task cancelled"));
            },
            { once: true },
        );

        child.stdout?.on("data", (b: Buffer) => {
            stdoutBuf += String(b);
        });

        // Stderr carries two interleaved streams: sentinel-framed progress
        // lines (-> notifyTask) and ordinary logs (forwarded to the terminal +
        // kept for crash diagnostics). Buffer by line to split them. Stdout
        // stays reserved for the single ABI-JSON response.
        child.stderr?.on("data", (b: Buffer) => {
            stderrLineBuf += String(b);
            let nl = stderrLineBuf.indexOf("\n");
            while (nl !== -1) {
                const line = stderrLineBuf.slice(0, nl);
                stderrLineBuf = stderrLineBuf.slice(nl + 1);
                handleStderrLine(line);
                nl = stderrLineBuf.indexOf("\n");
            }
        });

        child.on("error", (e) => fail(e));

        child.on("exit", (code) => {
            // Flush any final stderr line that arrived without a trailing newline.
            if (stderrLineBuf) {
                handleStderrLine(stderrLineBuf);
                stderrLineBuf = "";
            }

            const parsed = tryParseAbiOutput(stdoutBuf);

            if (parsed) {
                // Plugin spoke ABI — propagate verbatim (including success=false).
                // task-runner emits the COMPLETED/FAILED SSE based on parsed.success.
                resolve(parsed as unknown as PluginExecResult<S>);
                return;
            }

            // No JSON on stdout: hard runner failure (crash, exit before write, ...).
            const errMsg =
                code === 0
                    ? `Plugin produced non-JSON stdout: ${stdoutBuf.slice(0, 200)}`
                    : `Plugin failed (exit=${code}). ${stderrText.trim()}`;
            reject(new Error(errMsg));
        });

        try {
            child.stdin?.write(JSON.stringify(payload));
            child.stdin?.end();
        } catch (e) {
            fail(e);
        }
    });
}
