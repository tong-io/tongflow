import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CanvasWorkflowRunEvent } from "../../canvas/lib/workflow/runner-types";
import { MemoryAssetStore } from "../memory-store";
import { type ConformanceFixture, fakeExecutor } from "../testing/conformance";
import { createEngineCanvasRunner } from "./index";

const fixture = (name: string): ConformanceFixture =>
    JSON.parse(
        readFileSync(
            fileURLToPath(
                new URL(`../../../conformance/${name}.json`, import.meta.url),
            ),
            "utf-8",
        ),
    );

describe("createEngineCanvasRunner", () => {
    it("maps a branch failure onto canvas events (default policy branch)", async () => {
        const f = fixture("branch-failure-isolation");
        const runner = createEngineCanvasRunner({
            executor: fakeExecutor(f.plugins),
            store: new MemoryAssetStore(),
            concurrency: 1,
        });
        const events: CanvasWorkflowRunEvent[] = [];
        await runner.run(f.workflow, {
            signal: new AbortController().signal,
            onEvent: (e) => events.push(e),
        });
        expect(events.map((e) => e.type)).toEqual([
            "run-start",
            "node-start",
            "node-done",
            "node-start",
            "node-error",
            "node-skipped",
            "node-skipped",
            "node-start",
            "node-done",
            "run-done",
        ]);
        expect(events[2]).toMatchObject({
            nodeId: "ok",
            output: { success: true, text: "ok:go" },
            outputView: { text: { values: ["ok:go"] } },
        });
        expect(events[4]).toEqual({
            type: "node-error",
            nodeId: "bad",
            message: "boom",
        });
        expect(events[5]).toEqual({
            type: "node-skipped",
            nodeId: "badNext",
            reason: "upstream failed",
        });
        // `partial` still ends ok; failed / skipped nodes keep their state.
        expect(events.at(-1)).toEqual({ type: "run-done", ok: true });
    });

    it("forwards controls to the run in flight and refuses them when idle", async () => {
        const f = fixture("control-pause-resume");
        const runner = createEngineCanvasRunner({
            executor: fakeExecutor(f.plugins),
            store: new MemoryAssetStore(),
            concurrency: 1,
        });
        expect(runner.controls.pause()).toBe(false);
        expect(runner.controller).toBeNull();
        const events: CanvasWorkflowRunEvent[] = [];
        let resumed = false;
        const done = runner.run(f.workflow, {
            signal: new AbortController().signal,
            onEvent: (e) => {
                events.push(e);
                if (e.type === "node-start" && e.nodeId === "a") {
                    expect(runner.controls.pause()).toBe(true);
                    expect(runner.controls.skipNode("d")).toBe(true);
                    expect(
                        runner.controls.replaceImplementation("b", {
                            pluginId: "tongflow-api-fake-a",
                        }),
                    ).toBe(true);
                }
                if (e.type === "run-paused") {
                    setTimeout(() => {
                        resumed = runner.controls.resume();
                    }, 0);
                }
            },
        });
        expect(runner.controller?.active).toBe(true);
        await done;
        expect(resumed).toBe(true);
        expect(runner.controller).toBeNull();
        const types = events.map((e) => e.type);
        expect(types.slice(0, 5)).toEqual([
            "run-start",
            "node-start",
            "run-paused",
            "node-skipped",
            "node-done",
        ]);
        expect(types).toContain("run-resumed");
        const b = events.find(
            (e) => e.type === "node-done" && e.nodeId === "b",
        );
        expect(b).toMatchObject({ output: { text: "A(x)" } });
    });

    it("maps progress percent to a fraction and model downloads to a label", async () => {
        const runner = createEngineCanvasRunner({
            executor: {
                async invoke({ onProgress }) {
                    onProgress({
                        kind: "model-download",
                        model: "pp-ocr",
                        file: "det.onnx",
                        loaded: 1,
                        total: 4,
                    });
                    onProgress({
                        kind: "progress",
                        message: "go",
                        percent: 40,
                    });
                    return { success: true, text: "y" };
                },
            },
            store: new MemoryAssetStore(),
        });
        const f = fixture("linear-chain");
        const events: CanvasWorkflowRunEvent[] = [];
        await runner.run(f.workflow, {
            signal: new AbortController().signal,
            onEvent: (e) => events.push(e),
        });
        expect(events).toContainEqual({
            type: "node-download",
            nodeId: f.workflow.executableNodes[0].id,
            loaded: 1,
            total: 4,
            label: "pp-ocr · det.onnx",
        });
        expect(events).toContainEqual({
            type: "node-progress",
            nodeId: f.workflow.executableNodes[0].id,
            fraction: 0.4,
            message: "go",
        });
    });
});
