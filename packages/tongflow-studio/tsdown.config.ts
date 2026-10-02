import { defineConfig } from "tsdown";

/**
 * One Node build, three entries:
 *
 *  - `index`  — the library a host imports (Studio, StudioApi, the tools, the
 *    HTTP route handler, the MCP server).
 *  - `shared` — the data shapes a browser UI shares with it (types and tiny
 *    constants only).
 *  - `cli`    — the `tongflow-studio` bin.
 *
 * `tongflow` (the workflow core) stays external: it is a dependency.
 */
export default defineConfig({
    entry: {
        index: "src/index.ts",
        shared: "src/shared/types.ts",
        cli: "src/cli.ts",
    },
    outDir: "dist",
    format: ["esm"],
    platform: "node",
    target: "es2022",
    fixedExtension: false,
    dts: true,
    sourcemap: false,
    clean: true,
});
