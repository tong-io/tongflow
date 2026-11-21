import { defineConfig } from "tsdown";

/**
 * Entries:
 *  - `index`  → `tongflow`        (framework-free core; platform neutral)
 *  - `engine` / `engine-browser` / `engine-worker` → `tongflow/engine`,
 *    `tongflow/engine/browser`, `tongflow/engine/worker` (the TS workflow
 *    engine). Built with the core so they share its chunks; the browser entry
 *    only touches browser globals (Worker, OPFS) at call time.
 *  - `canvas` → `tongflow/canvas` (React canvas; browser)
 * Dependencies / peers stay external; only the source tree is bundled.
 * The canvas entry keeps its "use client" directive at the top of the chunk
 * (rolldown preserves module directives) so RSC bundlers treat it as a
 * client boundary.
 */
export default defineConfig([
    {
        // `canvas-messages` is server-safe (plain JSON catalogs, no "use client")
        // so RSC / SSR code can merge them into its i18n provider.
        entry: {
            index: "src/core/index.ts",
            "canvas-messages": "src/canvas/i18n/messages.ts",
            engine: "src/engine/index.ts",
            "engine-browser": "src/engine/browser/index.ts",
            "engine-worker": "src/engine/worker/index.ts",
        },
        format: ["esm", "cjs"],
        platform: "neutral",
        dts: true,
        sourcemap: false,
        clean: true,
        outDir: "dist",
    },
    {
        entry: { canvas: "src/canvas/index.ts" },
        format: ["esm", "cjs"],
        platform: "browser",
        dts: true,
        sourcemap: false,
        clean: false,
        outDir: "dist",
        // Externalize dynamic imports too (three/examples/*, @sparkjsdev/spark)
        // so nothing heavy is inlined; the consumer installs the deps.
        external: [/^three(\/|$)/, /^@sparkjsdev\//],
    },
]);
