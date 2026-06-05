/**
 * Verify handle-driven upstream collection and prompt construction.
 */

import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { targetHandleId } from "./handle-introspect";
import {
    buildPrompts,
    collectHandleValues,
    promptMissingRequired,
    resolveSpec,
} from "./resolve";
import { batchOn, configField, handle, staticValue } from "./sources";

function makeNode(
    id: string,
    type: string,
    data: Record<string, unknown>,
): Node {
    return { id, type, position: { x: 0, y: 0 }, data } as Node;
}

function makeEdge(
    id: string,
    source: string,
    target: string,
    targetHandle?: string,
): Edge {
    return { id, source, target, targetHandle } as Edge;
}

describe("resolve — collectHandleValues + buildPrompts", () => {
    it("collects ref_audio from upstream when using compose topology (default handle)", () => {
        const spec = resolveSpec("text-gen-speech-clone", {
            text: batchOn({ nodeType: "textNode", path: "texts" }),
        });
        const nodes = [
            makeNode("u1", "textNode", { texts: ["a", "b"] }),
            makeNode("u2", "audioNode", { fileKeys: ["voice.wav"] }),
            makeNode("n", "textGenSpeechCloneComposeNode", {}),
        ];
        const edges = [
            makeEdge("e1", "u1", "n", targetHandleId("text")),
            makeEdge("e2", "u2", "n", targetHandleId("ref_audio")),
        ];
        const values = collectHandleValues("n", spec, nodes, edges);
        expect(values.text).toEqual(["a", "b"]);
        expect(values.ref_audio).toBe("voice.wav");
    });

    it("buildPrompts reads ref_audio from config on transfer clone (configField)", () => {
        const spec = resolveSpec("text-gen-speech-clone", {
            text: batchOn({ nodeType: "textNode", path: "texts" }),
            ref_audio: configField(),
        });
        const prompts = buildPrompts({
            spec,
            configValues: { ref_audio: "uploads/ref.wav", language: "Auto" },
            handleValues: { text: ["hello"] },
        });
        expect(prompts).toEqual([
            {
                text: "hello",
                ref_audio: "uploads/ref.wav",
                language: "Auto",
            },
        ]);
    });

    it("collects a scalar handle value from the right upstream by targetHandle", () => {
        const spec = resolveSpec("text-gen-speech-clone", {
            text: handle({ nodeType: "textNode", path: "texts[0]" }),
        });
        const nodes = [
            makeNode("u1", "textNode", { texts: ["hello"] }),
            makeNode("u2", "audioNode", { fileKeys: ["audio-key"] }),
            makeNode("n", "textGenSpeechCloneNode", {}),
        ];
        const edges = [
            makeEdge("e1", "u1", "n", targetHandleId("text")),
            makeEdge("e2", "u2", "n", targetHandleId("ref_audio")),
        ];
        const values = collectHandleValues("n", spec, nodes, edges);
        expect(values.text).toBe("hello");
        expect(values.ref_audio).toBe("audio-key");
    });

    it("ignores edges with wrong targetHandle even if upstream type matches", () => {
        const spec = resolveSpec("text-gen-speech-clone", {
            text: handle({ nodeType: "textNode", path: "texts[0]" }),
        });
        const nodes = [
            makeNode("u1", "textNode", { texts: ["hello"] }),
            makeNode("n", "textGenSpeechCloneNode", {}),
        ];
        // Edge has no/handle-mismatched targetHandle → should not bind to `text`
        const edges = [makeEdge("e1", "u1", "n", "in:wrong")];
        const values = collectHandleValues("n", spec, nodes, edges);
        expect(values.text).toBeUndefined();
    });

    it("batchOn collects array values across multiple matching edges", () => {
        const spec = resolveSpec("image-gen-text", { image: batchOn() });
        const nodes = [
            makeNode("u1", "imageNode", { fileKeys: ["a", "b"] }),
            makeNode("u2", "imageNode", { fileKeys: ["c"] }),
            makeNode("n", "imageGenTextNode", {}),
        ];
        const edges = [
            makeEdge("e1", "u1", "n", targetHandleId("image")),
            makeEdge("e2", "u2", "n", targetHandleId("image")),
        ];
        const values = collectHandleValues("n", spec, nodes, edges);
        expect(values.image).toEqual(["a", "b", "c"]);
    });

    it("buildPrompts produces one prompt per batch item", () => {
        const spec = resolveSpec("image-gen-text", { image: batchOn() });
        const prompts = buildPrompts({
            spec,
            configValues: { text: "describe" },
            handleValues: { image: ["k1", "k2"] },
        });
        expect(prompts).toEqual([
            { text: "describe", image: "k1" },
            { text: "describe", image: "k2" },
        ]);
    });

    it("buildPrompts drops optional empty fields but keeps required ones", () => {
        const spec = resolveSpec("image-gen-text", {});
        // text is required, image is optional → empty image is dropped
        const prompts = buildPrompts({
            spec,
            configValues: { text: "hi" },
            handleValues: { image: undefined },
        });
        expect(prompts).toHaveLength(1);
        expect(prompts[0].text).toBe("hi");
        expect(prompts[0]).not.toHaveProperty("image");
    });

    it("promptMissingRequired flags empty required image-gen-video inputs", () => {
        const spec = resolveSpec("image-gen-video", {
            image: batchOn(),
            text: handle({ nodeType: "textNode", path: "texts[0]" }),
        });
        const prompts = buildPrompts({
            spec,
            configValues: { duration: 5 },
            handleValues: { image: ["fk1"], text: "scene" },
        });
        expect(prompts[0].text).toBe("scene");
        expect(promptMissingRequired(spec, prompts[0])).toBeUndefined();
        expect(promptMissingRequired(spec, { duration: 5, image: "fk1" })).toBe(
            "text",
        );
    });

    it("buildPrompts reads config text on image-gen-video transfer", () => {
        const spec = resolveSpec("image-gen-video", {
            image: batchOn(),
            text: configField(),
        });
        const prompts = buildPrompts({
            spec,
            configValues: { text: "pan left", duration: 8 },
            handleValues: { image: ["fk1"] },
        });
        expect(prompts[0].text).toBe("pan left");
        expect(prompts[0].duration).toBe(8);
    });

    it("static overrides flow through to prompt", () => {
        const spec = resolveSpec("image-gen-text", {
            text: staticValue("constant"),
        });
        const prompts = buildPrompts({
            spec,
            configValues: {},
            handleValues: {},
        });
        expect(prompts[0].text).toBe("constant");
    });
});
