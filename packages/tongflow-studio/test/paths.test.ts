import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveStudioRoot } from "../src/project/paths.ts";

const saved = process.env.TONGFLOW_STUDIO_ROOT;
afterEach(() => {
    if (saved === undefined) delete process.env.TONGFLOW_STUDIO_ROOT;
    else process.env.TONGFLOW_STUDIO_ROOT = saved;
});

describe("resolveStudioRoot", () => {
    it("defaults to ~/.tongflow/studio", () => {
        delete process.env.TONGFLOW_STUDIO_ROOT;
        expect(resolveStudioRoot()).toBe(
            join(homedir(), ".tongflow", "studio"),
        );
        expect(resolveStudioRoot("  ")).toBe(
            join(homedir(), ".tongflow", "studio"),
        );
    });

    it("prefers the configured path over the environment", () => {
        process.env.TONGFLOW_STUDIO_ROOT = "/from/env";
        expect(resolveStudioRoot()).toBe(resolve("/from/env"));
        expect(resolveStudioRoot("/configured")).toBe(resolve("/configured"));
    });

    it("expands a leading ~, which a JSON settings file leaves as written", () => {
        process.env.TONGFLOW_STUDIO_ROOT = "~/.dsh/tongflow";
        expect(resolveStudioRoot()).toBe(join(homedir(), ".dsh", "tongflow"));
        expect(resolveStudioRoot("~")).toBe(homedir());
        // Only a leading ~/ is the home directory; ~name and a ~ further in are paths.
        expect(resolveStudioRoot("/data/~/studio")).toBe(
            resolve("/data/~/studio"),
        );
    });
});
