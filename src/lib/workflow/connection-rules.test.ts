import type { Connection, Edge, Node } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";

import { registerAbiNode, unregisterAbiNode } from "@/lib/abi/node-registry";
import { isValidFlowConnection } from "./connection-rules";

/** Non-data RF type; the ABI slot is read from the registry, not node.data. */
function abiNode(id: string): Node {
    return { id, type: "abiNode", position: { x: 0, y: 0 }, data: {} };
}

function conn(
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string,
): Connection {
    return { source, sourceHandle, target, targetHandle };
}

function edge(
    id: string,
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string,
): Edge {
    return { id, source, sourceHandle, target, targetHandle };
}

const registered: string[] = [];
function register(nodeId: string, feature: string) {
    registerAbiNode({ nodeId, feature: feature as never, sourceSpec: {} });
    registered.push(nodeId);
}
afterEach(() => {
    for (const id of registered.splice(0)) unregisterAbiNode(id);
});

describe("isValidFlowConnection — modality gate", () => {
    it("rejects a video output into an image input handle", () => {
        register("vid", "image-gen-video"); // out:video (VideoRef)
        register("img", "image-edit"); // in:image (Asset, scalar)
        const c = conn("vid", "out:video", "img", "in:image");
        expect(
            isValidFlowConnection(c, [abiNode("vid"), abiNode("img")], []),
        ).toBe(false);
    });

    it("allows an image output into an image input handle", () => {
        register("src", "image-gen"); // out:image (ImageRef)
        register("dst", "image-edit"); // in:image
        const c = conn("src", "out:image", "dst", "in:image");
        expect(
            isValidFlowConnection(c, [abiNode("src"), abiNode("dst")], []),
        ).toBe(true);
    });
});

describe("isValidFlowConnection — single-edge (non-array) handles", () => {
    it("rejects a second edge into an already-occupied scalar handle", () => {
        register("s1", "image-gen");
        register("s2", "image-gen");
        register("t", "image-edit"); // in:image is scalar → single edge
        const existing = edge("e1", "s1", "out:image", "t", "in:image");
        const c = conn("s2", "out:image", "t", "in:image");
        expect(
            isValidFlowConnection(
                c,
                [abiNode("s1"), abiNode("s2"), abiNode("t")],
                [existing],
            ),
        ).toBe(false);
    });

    it("allows multiple edges into an array handle", () => {
        register("s1", "image-gen");
        register("s2", "image-gen");
        register("t", "image-fusion"); // in:images is array → multi-connect
        const existing = edge("e1", "s1", "out:image", "t", "in:images");
        const c = conn("s2", "out:image", "t", "in:images");
        expect(
            isValidFlowConnection(
                c,
                [abiNode("s1"), abiNode("s2"), abiNode("t")],
                [existing],
            ),
        ).toBe(true);
    });
});

describe("isValidFlowConnection — add node out handle is single-edge", () => {
    const addNode = (id: string): Node => ({
        id,
        type: "addTextNode",
        position: { x: 0, y: 0 },
        data: {},
    });
    const textNode = (id: string): Node => ({
        id,
        type: "textNode",
        position: { x: 0, y: 0 },
        data: {},
    });

    it("rejects a second outgoing edge from an add node", () => {
        const existing = edge("e1", "a", "out:textNode", "t1", "in:textNode");
        const c = conn("a", "out:textNode", "t2", "in:textNode");
        const nodes = [addNode("a"), textNode("t1"), textNode("t2")];
        expect(isValidFlowConnection(c, nodes, [existing])).toBe(false);
    });

    it("allows reconnecting the add node's own existing edge", () => {
        const e1 = edge("e1", "a", "out:textNode", "t1", "in:textNode");
        // Drag e1's target endpoint from t1 to t2; source (add node) unchanged.
        const c = conn("a", "out:textNode", "t2", "in:textNode");
        const nodes = [addNode("a"), textNode("t1"), textNode("t2")];
        expect(isValidFlowConnection(c, nodes, [e1])).toBe(false);
        expect(isValidFlowConnection(c, nodes, [e1], "e1")).toBe(true);
    });
});

describe("isValidFlowConnection — reconnect excludes the dragged edge", () => {
    it("does not flag the edge being reconnected as a duplicate", () => {
        register("s1", "image-gen");
        register("s2", "image-gen");
        register("t", "image-edit");
        // Reconnecting e1's source from s1 to s2; target handle unchanged.
        const e1 = edge("e1", "s1", "out:image", "t", "in:image");
        const c = conn("s2", "out:image", "t", "in:image");
        const nodes = [abiNode("s1"), abiNode("s2"), abiNode("t")];
        // Without ignoreEdgeId, e1 itself collides → rejected.
        expect(isValidFlowConnection(c, nodes, [e1])).toBe(false);
        // Excluding the dragged edge → allowed.
        expect(isValidFlowConnection(c, nodes, [e1], "e1")).toBe(true);
    });
});

describe("isValidFlowConnection — modality nodes can't feed each other", () => {
    const textNode = (id: string): Node => ({
        id,
        type: "textNode",
        position: { x: 0, y: 0 },
        data: {},
    });
    const addTextNode = (id: string): Node => ({
        id,
        type: "addTextNode",
        position: { x: 0, y: 0 },
        data: {},
    });

    it("rejects modality text → modality text", () => {
        const c = conn("a", "out:textNode", "b", "in:textNode");
        expect(
            isValidFlowConnection(c, [textNode("a"), textNode("b")], []),
        ).toBe(false);
    });

    it("still allows add node → modality text", () => {
        const c = conn("a", "out:textNode", "b", "in:textNode");
        expect(
            isValidFlowConnection(c, [addTextNode("a"), textNode("b")], []),
        ).toBe(true);
    });
});
