import "server-only";

import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { notifyTask } from "@/lib/task-emitter";
import { TaskStatus } from "@/constants/task-status";
import type { NodeSlot } from "@/generated/abi";
import type { PluginExecRequest, PluginExecResult } from "../types";
import { getLlmPluginConfig } from "@/lib/plugins-registry.server";
import { resolvePythonLite } from "@/lib/python-lite";

type LlmNdjsonEvent =
    | { type: "reasoning"; content: string }
    | { type: "answer"; content: string }
    | { type: "completed"; result: string }
    | { type: "error"; message: string };

function parseNdjsonLine(line: string): LlmNdjsonEvent | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    let obj: unknown;
    try {
        obj = JSON.parse(trimmed) as unknown;
    } catch {
        return null;
    }
    if (!obj || typeof obj !== "object") return null;
    const rec = obj as Record<string, unknown>;
    const type = rec.type;
    if (type === "reasoning" && typeof rec.content === "string") {
        return { type: "reasoning", content: rec.content };
    }
    if (type === "answer" && typeof rec.content === "string") {
        return { type: "answer", content: rec.content };
    }
    if (type === "completed" && typeof rec.result === "string") {
        return { type: "completed", result: rec.result };
    }
    if (type === "error" && typeof rec.message === "string") {
        return { type: "error", message: rec.message };
    }
    return null;
}

function llmSlotOutputFromCompleted<S extends NodeSlot>(
    nodeSlot: S,
    resultStr: string,
): PluginExecResult<S> {
    if (nodeSlot === "drop-video" || nodeSlot === "arrange-group") {
        try {
            const raw = JSON.parse(resultStr) as Record<string, unknown>;
            return {
                ...raw,
                success: raw.success !== false,
            } as PluginExecResult<S>;
        } catch {
            throw new Error(
                `Expected JSON object string in completed.result for ${nodeSlot}`,
            );
        }
    }
    return {
        success: true,
        result: resultStr,
        text: resultStr,
    } as PluginExecResult<S>;
}

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
        let lastResult: string | null = null;
        let sawCompleted = false;
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
            for (;;) {
                const idx = stdoutBuf.indexOf("\n");
                if (idx < 0) break;
                const line = stdoutBuf.slice(0, idx);
                stdoutBuf = stdoutBuf.slice(idx + 1);
                const evt = parseNdjsonLine(line);
                if (!evt) continue;
                if (evt.type === "reasoning") {
                    notifyTask(req.taskId, TaskStatus.RUNNING, {
                        type: "reasoning",
                        content: evt.content,
                    });
                } else if (evt.type === "answer") {
                    notifyTask(req.taskId, TaskStatus.RUNNING, {
                        type: "answer",
                        content: evt.content,
                    });
                } else if (evt.type === "completed") {
                    sawCompleted = true;
                    lastResult = evt.result;
                    let data: Record<string, unknown> = {
                        result: evt.result,
                        mode: "stream",
                    };
                    if (
                        req.nodeSlot === "drop-video" ||
                        req.nodeSlot === "arrange-group"
                    ) {
                        try {
                            const parsed = JSON.parse(evt.result) as Record<
                                string,
                                unknown
                            >;
                            data = { ...parsed, mode: "stream" };
                        } catch {
                            /* keep minimal payload */
                        }
                    }
                    notifyTask(req.taskId, TaskStatus.COMPLETED, data);
                } else if (evt.type === "error") {
                    notifyTask(req.taskId, TaskStatus.FAILED, {
                        message: evt.message,
                    });
                    fail(new Error(evt.message));
                    return;
                }
            }
        });

        child.stderr?.on("data", (b: Buffer) => {
            const t = String(b);
            stderrText += t;
        });

        child.on("error", (e) => fail(e));

        child.on("exit", (code) => {
            if (code === 0) {
                if (sawCompleted && lastResult != null) {
                    resolve(llmSlotOutputFromCompleted(req.nodeSlot, lastResult));
                } else {
                    reject(
                        new Error(
                            "LLM plugin exited without completed event.",
                        ),
                    );
                }
                return;
            }
            reject(
                new Error(
                    `LLM plugin failed (exit=${code}). ${stderrText.trim()}`,
                ),
            );
        });

        try {
            child.stdin?.write(JSON.stringify(payload));
            child.stdin?.end();
        } catch (e) {
            fail(e);
        }
    });
}

