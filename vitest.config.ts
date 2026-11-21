import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        css: false,
        environment: "node",
        include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "tongflow/canvas/messages": path.resolve(
                __dirname,
                "./packages/tongflow/src/canvas/i18n/messages.ts",
            ),
            "tongflow/engine/browser": path.resolve(
                __dirname,
                "./packages/tongflow/src/engine/browser/index.ts",
            ),
            "tongflow/engine/canvas": path.resolve(
                __dirname,
                "./packages/tongflow/src/engine/canvas/index.ts",
            ),
            "tongflow/engine": path.resolve(
                __dirname,
                "./packages/tongflow/src/engine/index.ts",
            ),
            "tongflow/canvas": path.resolve(
                __dirname,
                "./packages/tongflow/src/canvas/index.ts",
            ),
            tongflow: path.resolve(
                __dirname,
                "./packages/tongflow/src/core/index.ts",
            ),
        },
    },
});
