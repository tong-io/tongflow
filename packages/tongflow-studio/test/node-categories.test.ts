import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWN_NODE_TYPES } from "tongflow";
import { describe, expect, it } from "vitest";
import {
    NODE_TYPE_CATEGORY,
    type NodeCategory,
} from "../src/engine/node-categories.ts";

/**
 * The category table must mirror where each canvas component lives
 * (`packages/tongflow/src/canvas/nodes/<category>/`), as registered in
 * `node-types.tsx` — that directory layout is TongFlow's node grammar.
 */
describe("node categories", () => {
    it("match the canvas component directories and cover every known node type", () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(
            join(here, "../../tongflow/src/canvas/node-types.tsx"),
            "utf8",
        );
        const compToDir = new Map<string, NodeCategory>();
        for (const m of src.matchAll(
            /import (?:\{ )?(\w+)(?: \})? from "\.\/nodes\/(add|batch|compose|decompose|modality|transfer)\/[^"]+";/g,
        ))
            compToDir.set(m[1], m[2] as NodeCategory);
        const body = src.slice(src.indexOf("NODE_TYPES"));
        const expected: Record<string, NodeCategory> = {};
        for (const m of body.matchAll(/^\s*(\w+):\s*(\w+),?$/gm)) {
            const dir = compToDir.get(m[2]);
            if (dir) expected[m[1]] = dir;
        }
        expect(Object.keys(expected).length).toBeGreaterThan(50);
        expect(NODE_TYPE_CATEGORY).toEqual(expected);
        for (const type of KNOWN_NODE_TYPES)
            expect(NODE_TYPE_CATEGORY[type], type).toBeDefined();
    });
});
