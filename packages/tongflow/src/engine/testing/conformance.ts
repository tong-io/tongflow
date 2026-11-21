/**
 * Conformance harness: runs the shared fixtures in
 * `packages/tongflow/conformance/*.json` through the TypeScript engine.
 *
 * The fake-plugin step interpreter mirrors `run_fake_plugin` in
 * `sdk/tests/test_conformance.py` line for line; the Python engine runs the
 * same fixtures through its `invoker=` hook. Test-only: no entry exports it.
 */

import type { ExecutableWorkflow } from "../../core/workflow/executable-workflow";
import { inlineAssets } from "../assets";
import { base64ToBytes, base64ToUtf8, utf8ToBase64 } from "../base64";
import { MemoryAssetStore } from "../memory-store";
import { runWorkflow } from "../run-workflow";
import type {
    EngineEvent,
    NodeExecutor,
    NodeFailure,
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
        | "raise";
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
    when?: { field: string; equals: string };
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
    events: ProjectedEvent[];
}

export interface ConformanceFixture {
    name: string;
    description: string;
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
};

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

export function runFakePlugin(
    steps: readonly FakeStep[],
    prompt: Record<string, unknown>,
    model: string | undefined,
): Record<string, unknown> {
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
        async invoke({ pluginId, prompt, model, signal }) {
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
            return runFakePlugin(steps, prompt, model);
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
    const result = await runWorkflow(fixture.workflow, {
        executor: fakeExecutor(fixture.plugins, options.delayMs),
        store,
        inputs: fixture.inputs,
        concurrency: options.concurrency,
        onEvent: (e) => events.push(e),
    });
    return {
        status: result.status,
        outputs: await inlineAssets(result.outputs, store),
        outputsByName: await inlineAssets(result.outputsByName, store),
        errors: result.errors,
        failures: result.failures,
        events: projectEvents(events),
        rawEvents: events,
    };
}
