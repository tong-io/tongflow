/**
 * Run manager: queues runs (bounded concurrency), keeps their event logs for
 * late subscribers (SSE / job output), supports cancellation.
 */
import { randomUUID } from "node:crypto";
import type { ProjectRef } from "../project/manifest.ts";
import type { RunEvent, RunSummary } from "../shared/types.ts";
import type { Studio } from "../studio.ts";
import { nowIso } from "../util/fsx.ts";
import {
    executeRun,
    newRunSummary,
    type RunOutcome,
    type RunRequest,
} from "./run.ts";

export interface RunRecord {
    summary: RunSummary;
    events: RunEvent[];
    outcome?: RunOutcome;
    error?: string;
    done: Promise<RunRecord>;
    cancel: (reason?: string) => void;
    subscribe: (
        listener: (event: RunEvent, summary: RunSummary) => void,
    ) => () => void;
    /** Consume log lines appended since the last call (job output cursor). */
    readOutput: () => string;
}

const MAX_EVENTS = 2000;

export class RunManager {
    private readonly records = new Map<string, RunRecord>();
    private active = 0;
    private readonly queue: (() => void)[] = [];

    constructor(private readonly studio: Studio) {}

    get(runId: string): RunRecord | undefined {
        return this.records.get(runId);
    }

    list(projectId?: string): RunSummary[] {
        return [...this.records.values()]
            .map((r) => r.summary)
            .filter((s) => !projectId || s.projectId === projectId)
            .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    }

    /** Start (or queue) a run and return its record immediately. */
    start(project: ProjectRef, request: RunRequest): RunRecord {
        const runId = `run-${randomUUID().slice(0, 8)}`;
        const label =
            request.label ??
            request.workflowKey ??
            request.document?.name ??
            "workflow";
        const summary = newRunSummary(runId, project.id, label);
        const controller = new AbortController();
        const listeners = new Set<
            (event: RunEvent, summary: RunSummary) => void
        >();
        const events: RunEvent[] = [];
        let cursor = 0;

        const emit = (event: RunEvent) => {
            events.push(event);
            if (events.length > MAX_EVENTS)
                events.splice(0, events.length - MAX_EVENTS);
            applyToSummary(summary, event);
            for (const l of listeners) {
                try {
                    l(event, summary);
                } catch {
                    // listener errors never break the run
                }
            }
        };

        let resolveDone!: (r: RunRecord) => void;
        const done = new Promise<RunRecord>((resolve) => {
            resolveDone = resolve;
        });

        const record: RunRecord = {
            summary,
            events,
            done,
            cancel: (reason) => {
                if (
                    summary.status === "queued" ||
                    summary.status === "running"
                ) {
                    controller.abort(reason ?? "cancelled");
                }
            },
            subscribe: (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            readOutput: () => {
                const slice = events.slice(cursor);
                cursor = events.length;
                return slice.map(formatEvent).filter(Boolean).join("\n");
            },
        };
        this.records.set(runId, record);
        this.trim();

        const launch = async () => {
            this.active += 1;
            summary.status = "running";
            summary.startedAt = nowIso();
            emit({
                type: "log",
                at: nowIso(),
                message: `run ${runId} started: ${label}`,
            });
            try {
                if (controller.signal.aborted)
                    throw new Error("cancelled before start");
                record.outcome = await executeRun(
                    this.studio,
                    project,
                    request,
                    runId,
                    controller.signal,
                    emit,
                    summary,
                );
                summary.status = "completed";
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                summary.status = controller.signal.aborted
                    ? "cancelled"
                    : "failed";
                summary.error = message;
                record.error = message;
                emit({ type: "error", at: nowIso(), error: message });
            } finally {
                summary.finishedAt = nowIso();
                this.active -= 1;
                resolveDone(record);
                this.pump();
            }
        };
        this.queue.push(() => void launch());
        this.pump();
        return record;
    }

    private pump(): void {
        while (
            this.active < Math.max(1, this.studio.config.maxConcurrentRuns) &&
            this.queue.length > 0
        ) {
            const next = this.queue.shift()!;
            next();
        }
    }

    /** Keep memory bounded: drop the oldest finished records beyond 200. */
    private trim(): void {
        const finished = [...this.records.values()].filter(
            (r) => r.summary.finishedAt,
        );
        if (finished.length <= 200) return;
        finished.sort((a, b) =>
            a.summary.finishedAt! < b.summary.finishedAt! ? -1 : 1,
        );
        for (const r of finished.slice(0, finished.length - 200))
            this.records.delete(r.summary.runId);
    }
}

function applyToSummary(summary: RunSummary, event: RunEvent): void {
    switch (event.type) {
        case "node_started":
            if (event.nodeId)
                summary.nodes[event.nodeId] = {
                    status: "running",
                    ...(event.label ? { label: event.label } : {}),
                };
            break;
        case "plugin_progress":
            if (event.nodeId && summary.nodes[event.nodeId]) {
                Object.assign(summary.nodes[event.nodeId], {
                    ...(event.message ? { message: event.message } : {}),
                    ...(event.percent !== undefined
                        ? { percent: event.percent }
                        : {}),
                });
            } else {
                // Plugin-sourced progress carries no nodeId: attach to the running node(s).
                for (const n of Object.values(summary.nodes)) {
                    if (n.status === "running") {
                        if (event.message) n.message = event.message;
                        if (event.percent !== undefined)
                            n.percent = event.percent;
                    }
                }
            }
            break;
        case "node_completed":
            if (event.nodeId)
                summary.nodes[event.nodeId] = {
                    ...(summary.nodes[event.nodeId] ?? {}),
                    status: "completed",
                };
            break;
        case "node_failed":
            if (event.nodeId)
                summary.nodes[event.nodeId] = {
                    ...(summary.nodes[event.nodeId] ?? {}),
                    status: "failed",
                    ...(event.error ? { message: event.error } : {}),
                };
            break;
        default:
            break;
    }
}

export function formatEvent(e: RunEvent): string {
    switch (e.type) {
        case "log":
            return e.message ? `· ${e.message}` : "";
        case "workflow_started":
            return `▶ workflow started (${e.totalNodes ?? "?"} nodes, ${e.levels ?? "?"} levels)`;
        case "node_started":
            return `▶ ${e.label ?? e.nodeId} [${e.feature ?? ""}] started`;
        case "plugin_progress":
            return `… ${e.label ?? e.nodeId ?? ""} ${e.message ?? ""}${e.percent !== undefined ? ` ${Math.round(e.percent)}%` : ""}`.trim();
        case "node_completed":
            return `✓ ${e.label ?? e.nodeId} completed`;
        case "node_failed":
            return `✗ ${e.label ?? e.nodeId} failed: ${e.error ?? ""}`;
        case "workflow_completed":
            return "✓ workflow completed";
        case "workflow_failed":
            return `✗ workflow failed: ${e.error ?? ""}`;
        case "ingested":
            return e.files && e.files.length > 0
                ? `★ outputs: ${e.files.map((f) => f.key).join(", ")}`
                : "";
        case "error":
            return `✗ ${e.error ?? "error"}`;
        default:
            return "";
    }
}
