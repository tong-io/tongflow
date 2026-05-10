import { describe, expect, it } from "vitest";

import {
    AbiValidationError,
    extractAbiBusinessInput,
    validateSlotInput,
    validateSlotOutput,
} from "./abi-schema-validate";

describe("abi-schema-validate — input", () => {
    it("fails when business field type is wrong (gen_text text)", () => {
        const business = extractAbiBusinessInput({
            pluginId: "tongflow-llm-gemini",
            nodeSlot: "gen-text",
            text: 123,
        });
        const r = validateSlotInput("gen-text", business);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.failure.errorsText.length).toBeGreaterThan(0);
    });

    it("allows pluginId and nodeSlot on payload when ABI inputs omit those keys (strip)", () => {
        const business = extractAbiBusinessInput({
            pluginId: "modal-plugin-placeholder",
            nodeSlot: "transcribe",
            audio: { bytesBase64: "dGVzdA==" },
            context: "",
        });
        const r = validateSlotInput("transcribe", business);
        expect(r.ok).toBe(true);
    });

    it("strips routing object so ABI additionalProperties passes", () => {
        const business = extractAbiBusinessInput({
            routing: { pluginId: "x" },
            pluginId: "x",
            nodeSlot: "transcribe",
            audio: { bytesBase64: "dGVzdA==" },
            context: "",
        });
        expect(business.routing).toBeUndefined();
        expect(business.pluginId).toBeUndefined();
        const r = validateSlotInput("transcribe", business);
        expect(r.ok).toBe(true);
    });
});

describe("abi-schema-validate — output", () => {
    it("allows executor-style failure envelope", () => {
        const payload = {
            success: false,
            error: "boom",
        };
        const r = validateSlotOutput("gen-text", payload);
        expect(r.ok).toBe(true);
    });

    it("rejects unexpected extra keys on packaged output", () => {
        const payload = {
            success: true,
            text: "ok",
            notInAbi: true,
        };
        const r = validateSlotOutput("gen-text", payload);
        expect(r.ok).toBe(false);
    });

    it("allows transcribe_timestamp output with timestamps array", () => {
        const payload = {
            success: true,
            text: "x",
            time_stamps: [{ text: "a", start_time: 0, end_time: 1 }],
        };
        const r = validateSlotOutput("transcribe-timestamp", payload);
        expect(r.ok).toBe(true);
    });
});

describe("AbiValidationError", () => {
    it("preserves structured failure", () => {
        const biz = validateSlotInput(
            "gen-text",
            extractAbiBusinessInput({
                pluginId: "x",
                nodeSlot: "gen-text",
                text: 99,
            }),
        );
        expect(biz.ok).toBe(false);
        if (!biz.ok) {
            const err = new AbiValidationError(
                "input",
                "gen-text",
                biz.failure,
            );
            expect(err.failure.ajvErrors).toEqual(biz.failure.ajvErrors);
            expect(err.nodeSlot).toBe("gen-text");
            expect(err.kind).toBe("input");
        }
    });
});
