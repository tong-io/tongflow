import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    type ConformanceFixture,
    type ConformanceRun,
    type ProjectedEvent,
    runConformanceFixture,
} from "./testing/conformance";

/**
 * The shared conformance suite (the pytest half is
 * `sdk/tests/test_conformance.py`). Every fixture runs twice:
 *  - `concurrency: 1` must match the Python result and event stream exactly;
 *  - the default (whole level in parallel, with staggered plugin latency so
 *    siblings finish out of order) must produce the same outputs, the same
 *    events per node and level-ordered scheduling.
 *
 * Fixtures flagged `"engines": ["ts"]` (the `branch` failure policy and the
 * run controller) are TypeScript-only until the Python engine follows; their
 * `expected` was written from this engine and reviewed by hand. Their
 * parallel run checks the result only: controller steps react to events, so
 * the event order (and a rerun's return to an earlier level) is
 * timing-dependent there, and it runs without staggered latency so the
 * steps fire at the same points.
 */

const dir = fileURLToPath(new URL("../../conformance/", import.meta.url));
const fixtures: ConformanceFixture[] = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(`${dir}${f}`, "utf-8")));

/** Deterministic, uneven latency so parallel siblings complete out of order. */
const stagger = (pluginId: string) =>
    ([...pluginId].reduce((a, c) => a + c.charCodeAt(0), 0) % 4) * 3;

function eventsOf(events: readonly ProjectedEvent[], nodeId: string) {
    return events.filter((e) => e.nodeId === nodeId);
}

function levelOf(fixture: ConformanceFixture): Map<string, number> {
    const m = new Map<string, number>();
    fixture.workflow.executionLevels.forEach((ids, i) => {
        for (const id of ids) m.set(id, i);
    });
    return m;
}

function expectLevelOrder(fixture: ConformanceFixture, run: ConformanceRun) {
    const level = levelOf(fixture);
    const events = run.events;
    expect(events[0]?.type).toBe("workflow_started");
    expect(events.at(-1)?.type).toMatch(/^workflow_(completed|failed)$/);
    events.forEach((e, idx) => {
        if (e.type !== "node_started") return;
        const lv = level.get(e.nodeId as string) ?? 0;
        // Every node of an earlier level has ended before this one starts.
        for (const before of events.slice(idx + 1)) {
            if (
                (before.type === "node_completed" ||
                    before.type === "node_failed") &&
                (level.get(before.nodeId as string) ?? 0) < lv
            ) {
                throw new Error(
                    `${e.nodeId} (level ${lv}) started before ${before.nodeId} ended`,
                );
            }
        }
    });
}

describe("engine conformance fixtures", () => {
    it("covers the required cases", () => {
        const names = new Set(fixtures.map((f) => f.name));
        for (const required of [
            "linear-chain",
            "batch-fan-out",
            "collect-all",
            "expand-each-assets",
            "asset-roundtrip",
            "failure-abort",
            "multi-level-dag",
        ]) {
            expect(names).toContain(required);
        }
        for (const required of [
            "branch-failure-isolation",
            "control-skip-before-start",
            "control-skip-while-running",
            "control-pause-resume",
            "control-replace-rerun",
            "control-replace-failed-unskip",
        ]) {
            expect(names).toContain(required);
            const f = fixtures.find((x) => x.name === required);
            expect(f?.engines).toEqual(["ts"]);
        }
    });

    for (const fixture of fixtures) {
        describe(fixture.name, () => {
            it("matches the Python engine exactly when run sequentially", async () => {
                const { rawEvents: _raw, ...run } = await runConformanceFixture(
                    fixture,
                    { concurrency: 1 },
                );
                expect(run).toEqual(fixture.expected);
            });

            if (fixture.control?.length || fixture.failurePolicy === "branch") {
                it("produces the same result with parallel levels", async () => {
                    const run = await runConformanceFixture(fixture, {
                        ...(fixture.control?.length
                            ? {}
                            : { delayMs: stagger }),
                    });
                    const exp = fixture.expected;
                    expect(run.status).toBe(exp.status);
                    expect(run.outputs).toEqual(exp.outputs);
                    expect(run.outputsByName).toEqual(exp.outputsByName);
                    expect(run.errors).toEqual(exp.errors);
                    expect(run.failures).toEqual(exp.failures);
                    expect(run.skipped).toEqual(exp.skipped);
                    if (!fixture.control?.length)
                        expectLevelOrder(fixture, run);
                });
                return;
            }

            it("produces the same outputs with parallel levels", async () => {
                const run = await runConformanceFixture(fixture, {
                    delayMs: stagger,
                });
                const exp = fixture.expected;
                expect(run.status).toBe(exp.status);
                expect(run.errors).toEqual(exp.errors);
                expect(run.failures).toEqual(exp.failures);
                expectLevelOrder(fixture, run);

                if (exp.status === "success") {
                    expect(run.outputs).toEqual(exp.outputs);
                    expect(run.outputsByName).toEqual(exp.outputsByName);
                    const ids = fixture.workflow.executableNodes.map(
                        (n) => n.id,
                    );
                    for (const id of ids) {
                        expect(eventsOf(run.events, id)).toEqual(
                            eventsOf(exp.events, id),
                        );
                    }
                    expect(run.events).toHaveLength(exp.events.length);
                    return;
                }

                // A failure: levels before the failing one are identical; the
                // failing node's own events are identical; nothing later runs.
                const level = levelOf(fixture);
                const failed = exp.failures[0].nodeId;
                const failedLevel = level.get(failed) ?? 0;
                const earlier = Object.fromEntries(
                    Object.entries(exp.outputs).filter(
                        ([id]) => (level.get(id) ?? 0) < failedLevel,
                    ),
                );
                for (const [id, output] of Object.entries(earlier)) {
                    expect(run.outputs[id]).toEqual(output);
                }
                for (const id of Object.keys(run.outputs)) {
                    expect(level.get(id) ?? 0).toBeLessThanOrEqual(failedLevel);
                }
                expect(eventsOf(run.events, failed)).toEqual(
                    eventsOf(exp.events, failed),
                );
            });
        });
    }
});
