import type { JSONSchema7 } from "json-schema";
import { describe, expect, it } from "vitest";

import { ABI_NODES } from "@/generated/abi";

import {
    compareAbiProducerConsumerSchemas,
    narrowAbiProducerOutputField,
} from "./connection-validator";

describe("compareAbiProducerConsumerSchemas", () => {
    it("returns compatible when both sides are primitive string", () => {
        const r = compareAbiProducerConsumerSchemas(
            { type: "string" },
            { type: "string" },
        );
        expect(r).toBe("compatible");
    });

    it("returns disjoint when primitive types clearly clash", () => {
        expect(
            compareAbiProducerConsumerSchemas(
                { type: "string" },
                { type: "integer" },
            ),
        ).toBe("disjoint");

        expect(
            compareAbiProducerConsumerSchemas(
                { type: "boolean" },
                { type: "string" },
            ),
        ).toBe("disjoint");
    });

    it("marks number and integer overlap as compatible roots", () => {
        expect(
            compareAbiProducerConsumerSchemas(
                { type: "integer" },
                { type: "number" },
            ),
        ).toBe("compatible");
    });

    it("returns disjoint when overlapping object keys contradict", () => {
        expect(
            compareAbiProducerConsumerSchemas(
                {
                    type: "object",
                    properties: { x: { type: "string" } },
                },
                {
                    type: "object",
                    properties: { x: { type: "boolean" } },
                },
            ),
        ).toBe("disjoint");
    });

    it("returns unknown for anyOf unions (until OR-aggregate lands)", () => {
        expect(
            compareAbiProducerConsumerSchemas(
                { anyOf: [{ type: "string" }, { type: "number" }] },
                { type: "string" },
            ),
        ).toBe("unknown");
    });
});

describe("narrowAbiProducerOutputField", () => {
    const genTextOut = ABI_NODES["gen-text"].outputs as JSONSchema7;

    it("picks heuristic text field when outputField is texts", () => {
        const s = narrowAbiProducerOutputField(genTextOut, "texts", undefined);
        expect(s?.type).toBe("string");
    });

    it("respects preferredKeys before built-in text heuristics", () => {
        const outputs = {
            type: "object",
            properties: {
                text: { type: "string", enum: ["a"] },
                result: { type: "string", enum: ["b"] },
                texts: { type: "string", enum: ["c"] },
            },
        } as const satisfies JSONSchema7;

        const first = narrowAbiProducerOutputField(outputs, "texts", undefined);
        expect(first).toEqual({ type: "string", enum: ["a"] });

        const prioritized = narrowAbiProducerOutputField(outputs, "texts", [
            "texts",
            "text",
        ]);
        expect(prioritized).toEqual({ type: "string", enum: ["c"] });
    });
});
