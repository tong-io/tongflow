/**
 * Which graphs get the canvas's "Run workflow" action: the plugin ids the
 * canvas reads off its nodes, and the runner's optional `handles`.
 */

import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
});

import type { Node } from "@xyflow/react";
import type { CanvasWorkflowRunner } from "../lib/workflow/runner";
import { runnerTakesGraph, selectGraphPluginIds } from "./use-workflow-run";

const node = (id: string, data: Record<string, unknown>) =>
    ({ id, type: "x", position: { x: 0, y: 0 }, data }) as Node;

const run: CanvasWorkflowRunner["run"] = async () => undefined;

describe("selectGraphPluginIds", () => {
    it("lists the distinct, trimmed plugin ids of the nodes, sorted", () => {
        const key = selectGraphPluginIds({
            nodes: [
                node("t", { texts: ["hi"] }),
                node("a", { pluginId: "tongflow-modal-b" }),
                node("b", { pluginId: " tongflow-edge-essentials " }),
                node("c", { pluginId: "tongflow-modal-b" }),
                node("d", { pluginId: "" }),
                node("e", { pluginId: 3 }),
            ],
        } as never);
        expect(key).toBe("tongflow-edge-essentials\ntongflow-modal-b");
        expect(selectGraphPluginIds({ nodes: [] } as never)).toBe("");
    });
});

describe("runnerTakesGraph", () => {
    it("is false without a runner", () => {
        expect(runnerTakesGraph(undefined, "tongflow-edge-x")).toBe(false);
    });

    it("takes every graph when the runner has no handles", () => {
        expect(runnerTakesGraph({ run }, "")).toBe(true);
    });

    it("asks handles with the graph's plugin ids", () => {
        const handles = vi.fn(
            ({ pluginIds }: { pluginIds: readonly string[] }) =>
                pluginIds.some((id) => id.startsWith("tongflow-edge-")),
        );
        const runner: CanvasWorkflowRunner = { run, handles };
        expect(runnerTakesGraph(runner, "")).toBe(false);
        expect(handles).toHaveBeenLastCalledWith({ pluginIds: [] });
        expect(runnerTakesGraph(runner, "tongflow-modal-b")).toBe(false);
        expect(
            runnerTakesGraph(runner, "tongflow-edge-x\ntongflow-modal-b"),
        ).toBe(true);
        expect(handles).toHaveBeenLastCalledWith({
            pluginIds: ["tongflow-edge-x", "tongflow-modal-b"],
        });
    });
});
