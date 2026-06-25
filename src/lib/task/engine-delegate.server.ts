import "server-only";

import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { eq } from "drizzle-orm";
import {
    NodeStatus,
    TaskStatus,
    WorkflowStatus,
} from "@/constants/task-status";
import { getDb, tasks } from "@/db";
import { logger } from "@/lib/logger";
import { resolveBasePython } from "@/lib/plugins/plugin-python-env.server";
import { PYTHON_UTF8_ENV, resolvePythonLite } from "@/lib/plugins/python-lite";
import { dataDir, pluginsDir, resourcesDir } from "@/lib/runtime/paths.server";
import { withStoredEnv } from "@/lib/settings/env-store.server";
import {
    type SerializedWorkflowFailure,
    serializeTaskErrorForDb,
    workflowTaskFailureEnvelope,
} from "@/lib/task/error-envelope";
import { notifyTask, registerTask, removeTask } from "./emitter";

/**
 * Delegate workflow execution to the SDK engine (`python -m tongflow.engine`),
 * the single execution core shared with standalone `run_workflow`. This keeps
 * the app's own concerns here — DB `tasks` row, SSE `notifyTask`, abort — while
 * the engine owns tier execution, binding resolution, asset handling and plugin
 * spawning.
 *
 * The engine streams NDJSON on stdout: one `{event}` line per progress event,
 * then a final `{result}` (or `{error}`) line. Outputs land under
 * `data/uploads/tasks/<taskId>` with `file_key`s relative to `data/uploads`, so
 * the canvas reads them via `/api/uploads/<file_key>` exactly as before.
 *
 * This is the single workflow execution core — the legacy in-process TS runner
 * has been removed.
 */

function asRecord(v: unknown): Record<string, unknown> | null {
    return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
}

function str(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function handleEvent(taskId: string, ev: Record<string, unknown>): void {
    const type = str(ev.type);
    const nodeId = str(ev.nodeId);
    switch (type) {
        case "workflow_started":
            notifyTask(taskId, WorkflowStatus.WORKFLOW_STARTED, {
                totalNodes: num(ev.totalNodes) ?? 0,
                levels: num(ev.levels) ?? 0,
                nodes: [],
            });
            break;
        case "node_started":
            notifyTask(
                taskId,
                NodeStatus.NODE_STARTED,
                {
                    level: num(ev.level) ?? 0,
                    feature: str(ev.feature) ?? "",
                    label: str(ev.label) ?? "",
                },
                nodeId,
            );
            break;
        case "plugin_progress": {
            const percent = num(ev.percent);
            notifyTask(taskId, TaskStatus.RUNNING, {
                message: str(ev.message) ?? "",
                ...(percent != null ? { percent } : {}),
            });
            break;
        }
        case "node_completed":
            notifyTask(
                taskId,
                NodeStatus.NODE_COMPLETED,
                { output: ev.output, label: str(ev.label) ?? "" },
                nodeId,
            );
            break;
        case "node_failed":
            notifyTask(
                taskId,
                NodeStatus.NODE_FAILED,
                {
                    message: "Node execution failed",
                    error: str(ev.error) ?? "",
                    label: str(ev.label) ?? "",
                },
                nodeId,
            );
            break;
        default:
            // workflow_completed / workflow_failed / log: handled via the final
            // result line (or ignored).
            break;
    }
}

export async function executeWorkflowViaEngine(
    taskId: string,
    workflowJson: string,
    inputs: Record<string, unknown>,
): Promise<void> {
    const controller = registerTask(taskId);

    try {
        const db = await getDb();
        await db
            .update(tasks)
            .set({ status: "processing" })
            .where(eq(tasks.id, taskId));

        const python = resolveBasePython() ?? (await resolvePythonLite());
        const sdkDir = join(resourcesDir(), "sdk");
        const uploadsBase = join(dataDir(), "uploads");
        const outDir = join(uploadsBase, "tasks", taskId);

        const request = {
            workflow: JSON.parse(workflowJson),
            inputs,
            options: {
                // abi_path omitted on purpose: the engine falls back to the ABI
                // bundled in the SDK, which always exists in the resources dir.
                plugins_dir: pluginsDir(),
                data_dir: dataDir(),
                out_dir: outDir,
                file_key_base: uploadsBase,
                // Disk outputs: the canvas reads results via /api/uploads/<file_key>.
                inline_outputs: false,
                auto_install: true,
                task_id: taskId,
            },
        };

        const env = withStoredEnv({
            ...PYTHON_UTF8_ENV,
            PYTHONPATH: [sdkDir, process.env.PYTHONPATH?.trim()]
                .filter((x): x is string => Boolean(x))
                .join(delimiter),
        });

        await new Promise<void>((resolve, reject) => {
            const child = spawn(python, ["-m", "tongflow.engine"], {
                cwd: resourcesDir(),
                env,
                windowsHide: true,
                stdio: ["pipe", "pipe", "pipe"],
            });

            let stdoutBuf = "";
            let finalResult: Record<string, unknown> | null = null;
            let finalError: string | null = null;

            const onLine = (line: string) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                let parsed: unknown;
                try {
                    parsed = JSON.parse(trimmed);
                } catch {
                    logger.info(`[engine] ${trimmed}`);
                    return;
                }
                const rec = asRecord(parsed);
                if (!rec) return;
                if ("event" in rec) {
                    const ev = asRecord(rec.event);
                    if (ev) handleEvent(taskId, ev);
                } else if ("result" in rec) {
                    finalResult = asRecord(rec.result);
                } else if ("error" in rec) {
                    finalError = str(rec.error) ?? "Engine error";
                }
            };

            controller.signal.addEventListener(
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
                let nl = stdoutBuf.indexOf("\n");
                while (nl !== -1) {
                    onLine(stdoutBuf.slice(0, nl));
                    stdoutBuf = stdoutBuf.slice(nl + 1);
                    nl = stdoutBuf.indexOf("\n");
                }
            });

            child.stderr?.on("data", (b: Buffer) => {
                const s = String(b).trim();
                if (s) logger.info(`[engine:stderr] ${s}`);
            });

            child.on("error", (e) => reject(e));

            child.on("exit", async (code) => {
                if (controller.signal.aborted) return;
                if (stdoutBuf.trim()) onLine(stdoutBuf);

                try {
                    if (finalError) {
                        notifyTask(taskId, WorkflowStatus.WORKFLOW_FAILED, {
                            message: "Workflow execution failed",
                            error: finalError,
                        });
                        await db
                            .update(tasks)
                            .set({
                                status: "failed",
                                error: serializeTaskErrorForDb({
                                    message: finalError,
                                }),
                            })
                            .where(eq(tasks.id, taskId));
                        resolve();
                        return;
                    }

                    if (!finalResult) {
                        const msg = `Engine produced no result (exit=${code}).`;
                        notifyTask(taskId, WorkflowStatus.WORKFLOW_FAILED, {
                            message: msg,
                        });
                        await db
                            .update(tasks)
                            .set({
                                status: "failed",
                                error: serializeTaskErrorForDb({
                                    message: msg,
                                }),
                            })
                            .where(eq(tasks.id, taskId));
                        resolve();
                        return;
                    }

                    const result = finalResult as Record<string, unknown>;
                    const outputs = result.outputs ?? {};
                    if (result.status === "success") {
                        notifyTask(taskId, WorkflowStatus.WORKFLOW_COMPLETED, {
                            status: "success",
                            outputs,
                            totalDuration: 0,
                        });
                        await db
                            .update(tasks)
                            .set({
                                status: "completed",
                                result: JSON.stringify(outputs),
                            })
                            .where(eq(tasks.id, taskId));
                    } else {
                        const errors = Array.isArray(result.errors)
                            ? (result.errors as string[])
                            : [];
                        const failures = Array.isArray(result.failures)
                            ? (result.failures as SerializedWorkflowFailure[])
                            : [];
                        notifyTask(taskId, WorkflowStatus.WORKFLOW_FAILED, {
                            status: "failed",
                            outputs,
                            errors,
                            failures,
                        });
                        await db
                            .update(tasks)
                            .set({
                                status: "failed",
                                error: serializeTaskErrorForDb(
                                    workflowTaskFailureEnvelope(
                                        errors,
                                        failures,
                                    ),
                                ),
                            })
                            .where(eq(tasks.id, taskId));
                    }
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });

            try {
                child.stdin?.write(JSON.stringify(request));
                child.stdin?.end();
            } catch (e) {
                try {
                    child.kill();
                } catch {
                    // ignore
                }
                reject(e);
            }
        });
    } catch (error) {
        if (controller.signal.aborted) return;
        const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
        logger.error(`[engine] Task ${taskId} delegation failed: ${errorMsg}`);
        notifyTask(taskId, WorkflowStatus.WORKFLOW_FAILED, {
            message: "Workflow execution failed",
            error: errorMsg,
        });
        const db = await getDb();
        await db
            .update(tasks)
            .set({
                status: "failed",
                error: serializeTaskErrorForDb({ message: errorMsg }),
            })
            .where(eq(tasks.id, taskId));
    } finally {
        removeTask(taskId);
    }
}
