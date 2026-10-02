import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import { modelTakesImages } from "../src/tools.ts";

/**
 * `tongflow_look` degrades to a describe slot only for a model that is known
 * not to take images. The predicate must mirror the llm runtime's own rule
 * (`inputModalities !== undefined && !includes("image")` is what makes it
 * project images away) — erring toward "takes images" everywhere else, so an
 * unknown route never silently spends a plugin run on every look.
 */

interface Case {
    name: string;
    llm: unknown;
    options: { provider?: string; model?: string } | undefined;
    expected: boolean;
}

function ctx(llm: unknown): Context {
    return {
        get: (key: string) => (key === "llm" ? llm : undefined),
    } as unknown as Context;
}

function exec(options: Case["options"]) {
    return {
        agent: options === undefined ? undefined : { options },
        signal: new AbortController().signal,
    } as never;
}

function llmWith(inputModalities: readonly string[] | undefined) {
    return {
        resolveModelInfo: async () => ({ inputModalities }),
    };
}

const SELECTED = { provider: "deepseek-official", model: "deepseek-v4-pro" };

const cases: Case[] = [
    {
        name: "no llm service mounted",
        llm: undefined,
        options: SELECTED,
        expected: true,
    },
    {
        name: "no agent on the execution",
        llm: llmWith(["text"]),
        options: undefined,
        expected: true,
    },
    {
        name: "agent without a resolved provider/model",
        llm: llmWith(["text"]),
        options: {},
        expected: true,
    },
    {
        name: "model declares no modalities at all",
        llm: llmWith(undefined),
        options: SELECTED,
        expected: true,
    },
    {
        name: "model declares text only",
        llm: llmWith(["text"]),
        options: SELECTED,
        expected: false,
    },
    {
        name: "model declares text and image",
        llm: llmWith(["text", "image"]),
        options: SELECTED,
        expected: true,
    },
    {
        name: "resolveModelInfo throws",
        llm: {
            resolveModelInfo: async () => {
                throw new Error("unknown model");
            },
        },
        options: SELECTED,
        expected: true,
    },
];

describe("modelTakesImages", () => {
    for (const c of cases) {
        it(`${c.name} → ${c.expected}`, async () => {
            expect(await modelTakesImages(ctx(c.llm), exec(c.options))).toBe(
                c.expected,
            );
        });
    }
});
