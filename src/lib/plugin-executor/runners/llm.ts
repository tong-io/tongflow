import "server-only";

import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import type { NodeSlot } from "@/generated/abi";
import type { PluginExecRequest, PluginExecResult } from "../types";
import { getLlmPluginConfig } from "@/lib/plugins-registry.server";
import { resolvePythonLite } from "@/lib/python-lite";

function normalizePromptForNodeSlot(
    nodeSlot: string,
    input: Record<string, unknown>,
): Record<string, unknown> {
    if (nodeSlot !== "combine-text") return input;

    // `combine_text` node sends `{ texts: string[], userPrompt?: string, ... }`.
    // LLM text handlers expect `{ text: string, userPrompt?: string, ... }`.
    const texts = input.texts;
    if (Array.isArray(texts)) {
        const joined = texts.filter((x) => typeof x === "string").join("\n\n");
        return {
            ...input,
            text: joined,
            texts: undefined,
        };
    }
    return input;
}

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

export async function execLlmPlugin<S extends NodeSlot>(
    req: PluginExecRequest<S>,
): Promise<PluginExecResult<S>> {
    const cfg = getLlmPluginConfig(req.pluginId);
    if (!cfg) throw new Error(`Unknown llm plugin: ${req.pluginId}`);

    const method = cfg.methodsByNodeSlot[req.nodeSlot];
    if (!method) {
        throw new Error(
            `Plugin ${req.pluginId} does not implement nodeSlot=${req.nodeSlot}`,
        );
    }

    const prompt = normalizePromptForNodeSlot(
        req.nodeSlot,
        req.input as unknown as Record<string, unknown>,
    );

    const pluginDir = join(process.cwd(), cfg.localSubdir);
    const entry = cfg.entryFile || "entry.py";
    const python = await resolvePythonLite();
    const tongflowSdkDir = join(process.cwd(), "plugins", "tongflow");
    const pythonPathParts = [
        tongflowSdkDir,
        process.env.PYTHONPATH?.trim(),
    ].filter((x): x is string => Boolean(x));
    const pythonEnv = {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(delimiter),
    };

    const payload = {
        pluginId: req.pluginId,
        nodeSlot: req.nodeSlot,
        taskId: req.taskId,
        prompt,
    };

    return await new Promise<PluginExecResult<S>>((resolve, reject) => {
        const child = spawn(python, [entry], {
            cwd: pluginDir,
            env: pythonEnv,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdoutBuf = "";
        let stderrText = "";

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

        child.stderr?.on("data", (b: Buffer) => {
            stderrText += String(b);
        });

        child.on("error", (e) => fail(e));

        child.on("exit", (code) => {
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
                    ? `LLM plugin produced non-JSON stdout: ${stdoutBuf.slice(0, 200)}`
                    : `LLM plugin failed (exit=${code}). ${stderrText.trim()}`;
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
