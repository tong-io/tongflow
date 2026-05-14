import { describe, expect, it } from "vitest";

import { compareAbiProducerConsumerSchemas } from "./connection-validator";

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

    it("aggregates producer anyOf — compatible when every branch matches", () => {
        expect(
            compareAbiProducerConsumerSchemas(
                { anyOf: [{ type: "string" }, { type: "string" }] },
                { type: "string" },
            ),
        ).toBe("compatible");
    });

    it("aggregates producer anyOf — unknown when branches disagree", () => {
        expect(
            compareAbiProducerConsumerSchemas(
                { anyOf: [{ type: "string" }, { type: "number" }] },
                { type: "string" },
            ),
        ).toBe("unknown");
    });

    it("aggregates consumer anyOf — compatible when any branch matches", () => {
        expect(
            compareAbiProducerConsumerSchemas(
                { type: "string" },
                { anyOf: [{ type: "string" }, { type: "integer" }] },
            ),
        ).toBe("compatible");
    });

    it("aggregates consumer anyOf — disjoint when every branch clashes", () => {
        expect(
            compareAbiProducerConsumerSchemas(
                { type: "string" },
                { anyOf: [{ type: "boolean" }, { type: "integer" }] },
            ),
        ).toBe("disjoint");
    });
});
