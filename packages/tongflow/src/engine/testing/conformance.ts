/**
 * Conformance harness: runs the shared fixtures in
 * `packages/tongflow/conformance/*.json` through the TypeScript engine.
 *
 * The fake-plugin step interpreter mirrors `run_fake_plugin` in
 * `sdk/tests/test_conformance.py` line for line; the Python engine runs the
 * same fixtures through its `invoker=` hook. Test-only: no entry exports it.
 *
 * Fixtures flagged `"engines": ["ts"]` exercise TypeScript-only semantics
 * (the `branch` failure policy, the run controller); the pytest skips them
 * until the Python engine follows. Their extra vocabulary (the `progress` and
 * `wait-for-abort` ops, `failurePolicy`, `control`, the `skipped` / `control`
 * result keys, TS-only event keys) is defined here.
 */

import type { ExecutableWorkflow } from "../../core/workflow/executable-workflow";
import { inlineAssets } from "../assets";
import { base64ToBytes, base64ToUtf8, utf8ToBase64 } from "../base64";
import { MemoryAssetStore } from "../memory-store";
import { createRunController } from "../run-controller";
import { runWorkflow } from "../run-workflow";
import type {
    EngineEvent,
    ExecutorProgress,
    FailurePolicy,
    NodeExecutor,
    NodeFailure,
    NodeSkip,
    RunController,
    RunStatus,
    WorkflowInputValue,
} from "../types";

export interface FakeStep {
    op:
        | "set"
        | "format"
        | "join"
        | "map"
        | "asset"
        | "assets"
        | "fail"
        | "raise"
        // TS-only fixtures:
        | "progress"
        | "wait-for-abort";
    field?: string;
    value?: unknown;
    template?: string;
    from?: string;
    sep?: string;
    content?: string;
    mime?: string;
    filename?: string;
    count?: number;
    error?: string;
    /** `progress`: the message (a template) and optional percent. */
    message?: string;
    percent?: number;
    when?: { field: string; equals: string };
}

/**
 * A controller call a fixture makes when an event matches (TS-only). Each
 * step fires once, on the `nth` (default 1st) event whose fields equal `on`.
 */
export interface ControlStep {
    on: { type: string; [field: string]: unknown };
    nth?: number;
    do: "pause" | "resume" | "skipNode" | "replaceImplementation";
    nodeId?: string;
    pluginId?: string;
    model?: string;
    /** Call from a later macrotask instead of inside the event handler. */
    defer?: boolean;
}

export interface ProjectedEvent {
    type: string;
    [key: string]: unknown;
}

export interface ConformanceExpected {
    status: RunStatus;
    outputs: Record<string, Record<string, unknown>>;
    outputsByName: Record<string, unknown>;
    errors: string[];
    failures: NodeFailure[];
    /** Present only when a node ended skipped. */
    skipped?: NodeSkip[];
    /** What each control step's call returned, in firing order (fixtures with `control`). */
    control?: boolean[];
    events: ProjectedEvent[];
}

export interface ConformanceFixture {
    name: string;
    description: string;
    /** Engines that run this fixture; absent = both. */
    engines?: ("ts" | "python")[];
    failurePolicy?: FailurePolicy;
    control?: ControlStep[];
    workflow: ExecutableWorkflow;
    plugins: Record<string, FakeStep[]>;
    inputs?: Record<string, WorkflowInputValue>;
    assets?: Record<string, { text?: string; bytesBase64?: string }>;
    expected: ConformanceExpected;
}

/** Event fields fixtures pin down (same table as the pytest). */
export const EVENT_KEYS: Record<string, readonly string[]> = {
    workflow_started: ["totalNodes", "levels"],
    node_started: ["nodeId", "level"],
    plugin_progress: ["nodeId", "message"],
    node_completed: ["nodeId"],
    node_failed: ["nodeId", "error"],
    workflow_completed: ["status", "errors"],
    workflow_failed: ["status", "errors"],
    // TS-only so far (the pytest table gains them with the Python port).
    // Shared fixtures never produce them in a sequential run.
    node_skipped: ["nodeId", "reason"],
    node_cancelled: ["nodeId"],
    workflow_paused: [],
    workflow_resumed: [],
    workflow_cancelled: ["status", "errors"],
};

/** True when `fixture` runs on `engine`. */
export function fixtureRunsOn(
    fixture: Pick<ConformanceFixture, "engines">,
    engine: "ts" | "python",
): boolean {
    return !fixture.engines || fixture.engines.includes(engine);
}

type Scope = Record<string, unknown>;

function resolvePath(path: string, scope: unknown): unknown {
    let cur: unknown = scope;
    for (const part of path.split(".")) {
        if (typeof cur !== "object" || cur === null || Array.isArray(cur)) {
            return null;
        }
        const rec = cur as Record<string, unknown>;
        if (
            part === "text" &&
            !("text" in rec) &&
            typeof rec.bytesBase64 === "string"
        ) {
            cur = base64ToUtf8(rec.bytesBase64);
            continue;
        }
        cur = rec[part];
    }
    return cur;
}

/** Python's `json.dumps(v, sort_keys=True, separators=(",", ":"))` for plain data. */
function sortedJson(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(sortedJson).join(",")}]`;
    if (typeof v === "object" && v !== null) {
        const rec = v as Record<string, unknown>;
        const keys = Object.keys(rec).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${sortedJson(rec[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
}

function stringify(v: unknown): string {
    if (v == null) return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) return v.map(stringify).join(",");
    if (typeof v === "object") return sortedJson(v);
    return String(v);
}

function format(template: string, scope: unknown): string {
    return template.replace(/\{([^{}]+)\}/g, (_m, path: string) =>
        stringify(resolvePath(path, scope)),
    );
}

function makeAsset(step: FakeStep, scope: Scope): Record<string, unknown> {
    const asset: Record<string, unknown> = {
        bytesBase64: utf8ToBase64(format(step.content ?? "", scope)),
    };
    for (const key of ["mime", "filename"] as const) {
        const tpl = step[key];
        if (tpl) {
            const value = format(tpl, scope);
            if (value) asset[key] = value;
        }
    }
    return asset;
}

/** Live hooks for the TS-only `progress` / `wait-for-abort` ops. */
export interface FakePluginContext {
    signal?: AbortSignal;
    onProgress?: (progress: ExecutorProgress) => void;
}

const untilAborted = (signal: AbortSignal | undefined) =>
    new Promise<never>((_resolve, reject) => {
        if (!signal) return;
        const fail = () => reject(new Error("aborted"));
        if (signal.aborted) fail();
        else signal.addEventListener("abort", fail, { once: true });
    });

export function runFakePlugin(
    steps: readonly FakeStep[],
    prompt: Record<string, unknown>,
    model: string | undefined,
    ctx: FakePluginContext = {},
): Record<string, unknown> | Promise<Record<string, unknown>> {
    const scope: Scope = { ...prompt, _model: model ?? null };
    const out: Record<string, unknown> = { success: true };
    for (const step of steps) {
        if (
            step.when &&
            stringify(resolvePath(step.when.field, scope)) !== step.when.equals
        ) {
            continue;
        }
        const field = step.field ?? "";
        const listOf = (v: unknown) => (Array.isArray(v) ? v : [v]);
        switch (step.op) {
            case "set":
                out[field] = step.value;
                break;
            case "format":
                out[field] = format(step.template ?? "", scope);
                break;
            case "join":
                out[field] = listOf(resolvePath(step.from ?? "", scope))
                    .map(stringify)
                    .join(step.sep ?? "");
                break;
            case "map":
                out[field] = listOf(resolvePath(step.from ?? "", scope)).map(
                    (item) => format(step.template ?? "", { ...scope, item }),
                );
                break;
            case "asset":
                out[field] = makeAsset(step, scope);
                break;
            case "assets":
                out[field] = Array.from({ length: step.count ?? 0 }, (_, i) =>
                    makeAsset(step, { ...scope, i: i + 1 }),
                );
                break;
            case "fail":
                return {
                    success: false,
                    error: format(step.error ?? "", scope),
                };
            case "raise":
                throw new Error(format(step.error ?? "", scope));
            case "progress":
                ctx.onProgress?.({
                    kind: "progress",
                    message: format(step.message ?? "", scope),
                    ...(step.percent !== undefined
                        ? { percent: step.percent }
                        : {}),
                });
                break;
            case "wait-for-abort":
                // Blocks until the engine aborts the node's signal.
                return untilAborted(ctx.signal);
            default:
                throw new Error(`unknown fake plugin op ${String(step.op)}`);
        }
    }
    return out;
}

/** A {@link NodeExecutor} running a fixture's fake plugins. `delayMs` makes calls async. */
export function fakeExecutor(
    plugins: Record<string, FakeStep[]>,
    delayMs?: (pluginId: string, prompt: Record<string, unknown>) => number,
): NodeExecutor {
    return {
        async invoke({ pluginId, prompt, model, signal, onProgress }) {
            const steps = plugins[pluginId];
            if (!steps) throw new Error(`no fake plugin ${pluginId}`);
            const ms = delayMs?.(pluginId, prompt) ?? 0;
            if (ms > 0) {
                await new Promise<void>((resolve, reject) => {
                    const t = setTimeout(resolve, ms);
                    signal.addEventListener("abort", () => {
                        clearTimeout(t);
                        reject(new Error("aborted"));
                    });
                });
            }
            return runFakePlugin(steps, prompt, model, { signal, onProgress });
        },
    };
}

export function projectEvents(
    events: readonly EngineEvent[],
): ProjectedEvent[] {
    const out: ProjectedEvent[] = [];
    for (const e of events) {
        const keys = EVENT_KEYS[e.type];
        if (!keys) continue;
        const rec = e as unknown as Record<string, unknown>;
        const p: ProjectedEvent = { type: e.type };
        for (const k of keys) if (k in rec) p[k] = rec[k];
        out.push(p);
    }
    return out;
}

export interface ConformanceRun extends ConformanceExpected {
    /** Every event, unprojected (includes TS-only `node_cancelled`). */
    rawEvents: EngineEvent[];
}

/** Run a fixture through the TS engine and project the result like the pytest does. */
export async function runConformanceFixture(
    fixture: ConformanceFixture,
    options: {
        concurrency?: number;
        delayMs?: (pluginId: string, prompt: Record<string, unknown>) => number;
    } = {},
): Promise<ConformanceRun> {
    const seed: Record<string, Uint8Array> = {};
    for (const [key, spec] of Object.entries(fixture.assets ?? {})) {
        seed[key] =
            spec.bytesBase64 !== undefined
                ? base64ToBytes(spec.bytesBase64)
                : new TextEncoder().encode(spec.text ?? "");
    }
    const store = new MemoryAssetStore(seed);
    const events: EngineEvent[] = [];
    const steps = fixture.control ?? [];
    const controller = steps.length > 0 ? createRunController() : undefined;
    const fired = steps.map(() => false);
    const seen = steps.map(() => 0);
    const controlResults: boolean[] = [];
    const deferred: Promise<void>[] = [];
    const onEvent = (e: EngineEvent) => {
        events.push(e);
        if (!controller) return;
        const rec = e as unknown as Record<string, unknown>;
        steps.forEach((step, i) => {
            if (fired[i]) return;
            const matches = Object.entries(step.on).every(
                ([k, v]) => rec[k] === v,
            );
            if (!matches || ++seen[i] < (step.nth ?? 1)) return;
            fired[i] = true;
            const call = () => {
                controlResults.push(applyControl(controller, step));
            };
            if (step.defer) {
                deferred.push(
                    new Promise((resolve) =>
                        setTimeout(() => {
                            call();
                            resolve();
                        }, 0),
                    ),
                );
            } else {
                call();
            }
        });
    };
    const result = await runWorkflow(fixture.workflow, {
        executor: fakeExecutor(fixture.plugins, options.delayMs),
        store,
        inputs: fixture.inputs,
        concurrency: options.concurrency,
        failurePolicy: fixture.failurePolicy,
        controller,
        onEvent,
    });
    await Promise.all(deferred);
    return {
        status: result.status,
        outputs: await inlineAssets(result.outputs, store),
        outputsByName: await inlineAssets(result.outputsByName, store),
        errors: result.errors,
        failures: result.failures,
        ...(result.skipped.length > 0 ? { skipped: result.skipped } : {}),
        ...(steps.length > 0 ? { control: controlResults } : {}),
        events: projectEvents(events),
        rawEvents: events,
    };
}

function applyControl(controller: RunController, step: ControlStep): boolean {
    switch (step.do) {
        case "pause":
            return controller.pause();
        case "resume":
            return controller.resume();
        case "skipNode":
            return controller.skipNode(step.nodeId ?? "");
        case "replaceImplementation":
            return controller.replaceImplementation(step.nodeId ?? "", {
                pluginId: step.pluginId ?? "",
                ...(step.model ? { model: step.model } : {}),
            });
    }
}
