import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { WorkflowExporter } from "./exporter";

/**
 * Channel pass-through: a data node fed by an executable is a pure channel —
 * consumers bind straight to the producer's output field, and sibling data
 * nodes materialized from the same channel collapse to a single source.
 */

const pos = { x: 0, y: 0 };

function textNode(id: string, texts: string[]): Node {
    return { id, type: "textNode", position: pos, data: { texts } };
}

function buildSplitFanIn(consumerFeature: "combine-text" | "gen-text") {
    // src(text) → split-text → tn1/tn2 (materialized at edit time, stale
    // staticData) → consumer. Specs come from the static node-type registry
    // (splitTextNode / textsGenTextNode / genTextNode).
    const consumerId = consumerFeature === "combine-text" ? "combine" : "gen";
    const consumerType =
        consumerFeature === "combine-text" ? "textsGenTextNode" : "genTextNode";

    const consumerHandle =
        consumerFeature === "combine-text" ? "in:texts" : "in:text";
    const nodes: Node[] = [
        textNode("src", ["long input"]),
        { id: "split", type: "splitTextNode", position: pos, data: {} },
        textNode("tn1", ["stale-1"]),
        textNode("tn2", ["stale-2"]),
        { id: consumerId, type: consumerType, position: pos, data: {} },
    ];
    const edges: Edge[] = [
        { id: "e1", source: "src", target: "split", targetHandle: "in:text" },
        {
            id: "e2",
            source: "split",
            target: "tn1",
            sourceHandle: "out:texts",
        },
        {
            id: "e3",
            source: "split",
            target: "tn2",
            sourceHandle: "out:texts",
        },
        {
            id: "e4",
            source: "tn1",
            target: consumerId,
            targetHandle: consumerHandle,
        },
        {
            id: "e5",
            source: "tn2",
            target: consumerId,
            targetHandle: consumerHandle,
        },
    ];
    return {
        workflow: new WorkflowExporter(nodes, edges).export(),
        consumerId,
    };
}

describe("WorkflowExporter channel pass-through", () => {
    it("binds an array consumer to the producer channel, deduped", () => {
        const { workflow, consumerId } = buildSplitFanIn("combine-text");
        const consumer = workflow.executableNodes.find(
            (n) => n.id === consumerId,
        );
        expect(consumer).toBeDefined();
        const binding = consumer?.bindings.texts;
        if (binding?.kind !== "handle") throw new Error("expected handle");
        expect(binding.consumerShape).toBe("array");
        // Two sibling text nodes collapse into one producer-channel source.
        expect(binding.sources).toEqual([
            { fromNodeId: "split", fromField: "texts" },
        ]);
    });

    it("binds a batch consumer to the producer channel with batchField kept", () => {
        const { workflow, consumerId } = buildSplitFanIn("gen-text");
        const consumer = workflow.executableNodes.find(
            (n) => n.id === consumerId,
        );
        expect(consumer?.batchField).toBe("text");
        const binding = consumer?.bindings.text;
        if (binding?.kind !== "handle") throw new Error("expected handle");
        expect(binding.consumerShape).toBe("scalar");
        expect(binding.sources).toEqual([
            { fromNodeId: "split", fromField: "texts" },
        ]);
    });

    it("keeps a standalone data node (no executable producer) as the source", () => {
        const { workflow } = buildSplitFanIn("combine-text");
        const split = workflow.executableNodes.find((n) => n.id === "split");
        const binding = split?.bindings.text;
        if (binding?.kind !== "handle") throw new Error("expected handle");
        expect(binding.sources).toEqual([
            { fromNodeId: "src", fromField: "texts" },
        ]);
    });
});
