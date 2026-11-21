/**
 * Run-whole-workflow entry: a fake `CanvasWorkflowRunner` emits the
 * documented events and the canvas projects them onto node state (task
 * store) and results (flow store), the same stores single-node tasks use.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
});

import {
    type ExecutableWorkflow,
    exportWorkflow,
    getAbiNodeBySlot,
    resolveAbiOutputMappings,
} from "../../../core";
import { useFlow } from "../../hooks/use-flow";
import { useTaskStore } from "../../hooks/use-task";
import { computeOutputView } from "../task/payload";
import {
    type CanvasWorkflowRunEvent,
    type CanvasWorkflowRunner,
    createWorkflowRunEventApplier,
    runCanvasWorkflow,
} from "./runner";

function reset() {
    useFlow.setState({
        nodes: [],
        edges: [],
        historyPast: [],
        historyFuture: [],
    });
    useTaskStore.setState({
        nodeExecutionStatusMap: new Map(),
        nodeRunProgressMap: new Map(),
        workflowExecutionStatus: "idle",
    });
}

/** One text-to-image node; its result spawns / fills a downstream image node. */
function setupImageGen(): { nodeId: string; doc: ExecutableWorkflow } {
    const nodeId = useFlow
        .getState()
        .addNode({ type: "textGenImageNode", data: { feature: "image-gen" } });
    const { nodes, edges } = useFlow.getState();
    return {
        nodeId,
        doc: exportWorkflow(nodes, edges, { includeOriginalFlow: false }),
    };
}

const imageGenRoutes = () => {
    const abiNode = getAbiNodeBySlot("image-gen");
    if (!abiNode) throw new Error("image-gen slot missing");
    return resolveAbiOutputMappings(abiNode);
};

/** The image-gen result payload with one generated image. */
function imageGenResult(fileKey: string): Record<string, unknown> {
    const route = imageGenRoutes()[0];
    const item = route.itemValuePath
        ? { [route.itemValuePath]: fileKey }
        : fileKey;
    return { [route.sourceField]: route.isArrayOfArrays ? [[item]] : [item] };
}

const downstreamOf = (nodeId: string) => {
    const { nodes, edges } = useFlow.getState();
    const targets = edges
        .filter((e) => e.source === nodeId)
        .map((e) => e.target);
    return nodes.filter((n) => targets.includes(n.id));
};

const status = (nodeId: string) =>
    useTaskStore.getState().nodeExecutionStatusMap.get(nodeId);
const progress = (nodeId: string) =>
    useTaskStore.getState().nodeRunProgressMap.get(nodeId);

/** A runner that plays `script` (events, or awaited pauses) in order. */
function scriptedRunner(
    script: Array<CanvasWorkflowRunEvent | (() => Promise<void>)>,
): CanvasWorkflowRunner & { docs: ExecutableWorkflow[] } {
    const docs: ExecutableWorkflow[] = [];
    return {
        docs,
        run: async (doc, { onEvent }) => {
            docs.push(doc);
            for (const step of script) {
                if (typeof step === "function") await step();
                else onEvent(step);
            }
        },
    };
}

describe("workflow runner events → node state", () => {
    beforeEach(reset);

    it("walks a node through start, progress, download and done", () => {
        const { nodeId, doc } = setupImageGen();
        const apply = createWorkflowRunEventApplier(doc);

        apply({ type: "run-start" });
        expect(useTaskStore.getState().workflowExecutionStatus).toBe("running");

        apply({ type: "node-start", nodeId });
        expect(status(nodeId)).toBe("running");

        apply({
            type: "node-download",
            nodeId,
            loaded: 120 * 1024 * 1024,
            total: 237 * 1024 * 1024,
            label: "sd-turbo",
        });
        expect(progress(nodeId)).toEqual({
            download: {
                loaded: 120 * 1024 * 1024,
                total: 237 * 1024 * 1024,
                label: "sd-turbo",
            },
        });

        apply({
            type: "node-progress",
            nodeId,
            fraction: 0.5,
            message: "step 10/20",
        });
        expect(progress(nodeId)).toEqual({
            fraction: 0.5,
            message: "step 10/20",
        });

        const view = computeOutputView(
            imageGenRoutes(),
            imageGenResult("out/cat.png"),
        );
        apply({ type: "node-done", nodeId, outputView: view });
        expect(status(nodeId)).toBe("completed");
        expect(progress(nodeId)).toBeUndefined();

        const [image] = downstreamOf(nodeId);
        expect(image?.type).toBe(imageGenRoutes()[0].nodeType);
        expect(
            (image?.data as Record<string, unknown>)[
                imageGenRoutes()[0].dataField
            ],
        ).toEqual(["out/cat.png"]);

        apply({ type: "run-done", ok: true });
        expect(useTaskStore.getState().workflowExecutionStatus).toBe(
            "completed",
        );
    });

    it("routes a raw `output` exactly like a single-node task", () => {
        const { nodeId, doc } = setupImageGen();
        const apply = createWorkflowRunEventApplier(doc);
        apply({ type: "run-start" });
        apply({
            type: "node-done",
            nodeId,
            outputView: {},
            output: imageGenResult("out/dog.png"),
        });
        const [image] = downstreamOf(nodeId);
        expect(
            (image?.data as Record<string, unknown>)[
                imageGenRoutes()[0].dataField
            ],
        ).toEqual(["out/dog.png"]);
    });

    it("marks a failed node and the run", () => {
        const { nodeId, doc } = setupImageGen();
        const apply = createWorkflowRunEventApplier(doc);
        apply({ type: "run-start" });
        apply({ type: "node-start", nodeId });
        apply({ type: "node-error", nodeId, message: "out of memory" });
        expect(status(nodeId)).toBe("failed");
        expect(progress(nodeId)).toEqual({ error: "out of memory" });
        apply({ type: "run-done", ok: false });
        expect(useTaskStore.getState().workflowExecutionStatus).toBe("failed");
        expect(downstreamOf(nodeId)).toHaveLength(0);
    });

    it("run-start clears the previous run's node state", () => {
        const { nodeId, doc } = setupImageGen();
        const apply = createWorkflowRunEventApplier(doc);
        apply({ type: "node-error", nodeId, message: "boom" });
        apply({ type: "run-start" });
        expect(status(nodeId)).toBeUndefined();
        expect(progress(nodeId)).toBeUndefined();
    });

    it("run-done stops nodes the runner never finished", () => {
        const { nodeId, doc } = setupImageGen();
        const apply = createWorkflowRunEventApplier(doc);
        apply({ type: "run-start" });
        apply({ type: "node-start", nodeId });
        apply({ type: "run-done", ok: false, error: "engine crashed" });
        expect(status(nodeId)).toBeUndefined();
    });
});

describe("runCanvasWorkflow", () => {
    beforeEach(reset);

    it("hands the exported doc to the runner and applies its events", async () => {
        const { nodeId, doc } = setupImageGen();
        const runner = scriptedRunner([
            { type: "run-start" },
            { type: "node-start", nodeId },
            {
                type: "node-done",
                nodeId,
                outputView: computeOutputView(
                    imageGenRoutes(),
                    imageGenResult("out/a.png"),
                ),
            },
            { type: "run-done", ok: true },
        ]);
        await runCanvasWorkflow(runner, doc, new AbortController().signal);
        expect(runner.docs).toEqual([doc]);
        expect(runner.docs[0].executableNodes.map((n) => n.id)).toEqual([
            nodeId,
        ]);
        expect(status(nodeId)).toBe("completed");
        expect(useTaskStore.getState().workflowExecutionStatus).toBe(
            "completed",
        );
        expect(downstreamOf(nodeId)).toHaveLength(1);
    });

    it("synthesizes run-done when the runner rejects", async () => {
        const { nodeId, doc } = setupImageGen();
        const runner: CanvasWorkflowRunner = {
            run: async (_doc, { onEvent }) => {
                onEvent({ type: "run-start" });
                onEvent({ type: "node-start", nodeId });
                throw new Error("worker died");
            },
        };
        await runCanvasWorkflow(runner, doc, new AbortController().signal);
        expect(useTaskStore.getState().workflowExecutionStatus).toBe("failed");
        expect(status(nodeId)).toBeUndefined();
    });

    it("abort resets to idle and drops later events", async () => {
        const { nodeId, doc } = setupImageGen();
        const controller = new AbortController();
        const runner = scriptedRunner([
            { type: "run-start" },
            { type: "node-start", nodeId },
            async () => controller.abort(),
            {
                type: "node-done",
                nodeId,
                outputView: computeOutputView(
                    imageGenRoutes(),
                    imageGenResult("out/late.png"),
                ),
            },
            { type: "run-done", ok: true },
        ]);
        await runCanvasWorkflow(runner, doc, controller.signal);
        expect(useTaskStore.getState().workflowExecutionStatus).toBe("idle");
        expect(status(nodeId)).toBeUndefined();
        expect(downstreamOf(nodeId)).toHaveLength(0);
    });
});
