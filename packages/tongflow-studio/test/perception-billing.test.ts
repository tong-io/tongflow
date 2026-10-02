import { describe, expect, it } from "vitest";
import { describeViaSlot } from "../src/tools/run-tools.ts";
import type { ToolEnv } from "../src/tools/support.ts";

/**
 * Understanding a file is a plugin run like any other. A billing plugin must
 * not run without the user's yes — the same invariant `tongflow_workflow_run`
 * enforces — while a local plugin needs no ceremony.
 */

function env(billing: string, started: { count: number }): ToolEnv {
    return {
        studio: {},
        api: {
            registry: async () => ({
                registry: {
                    nodePluginMap: { "image-describe": ["some-plugin"] },
                },
            }),
            pluginBilling: async () => ({
                billing,
                note: `billed as ${billing}`,
            }),
            startCanvasRun: async () => {
                started.count += 1;
                return {
                    done: Promise.resolve(),
                    summary: { status: "completed" },
                    outcome: {
                        texts: { out: ["a tired mechanic in the rain"] },
                        result: { outputs: {} },
                    },
                    events: [],
                };
            },
        },
    } as unknown as ToolEnv;
}

const PROMPT = { image: "/p/x.png", text: "Describe this image in detail." };

async function call(billing: string, confirmed?: boolean) {
    const started = { count: 0 };
    const out = await describeViaSlot(
        env(billing, started),
        "PRJ-X",
        "image-describe",
        PROMPT,
        undefined,
        confirmed,
    );
    return { out, started };
}

describe("describeViaSlot billing gate", () => {
    it("a local plugin runs without confirmation", async () => {
        const { out, started } = await call("local");
        expect(out.ok).toBe(true);
        expect(started.count).toBe(1);
        expect(out.answer).toContain("tired mechanic");
    });

    for (const billing of ["api", "modal"]) {
        it(`a ${billing} plugin does not run unconfirmed`, async () => {
            const { out, started } = await call(billing);
            expect(out.ok).toBe(false);
            expect(out.needs_confirmation).toBe(true);
            expect(out.billing).toBe(billing);
            expect(started.count).toBe(0);
        });

        it(`a ${billing} plugin runs once confirmed`, async () => {
            const { out, started } = await call(billing, true);
            expect(out.ok).toBe(true);
            expect(out.needs_confirmation).toBeUndefined();
            expect(started.count).toBe(1);
        });
    }
});
