import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
        // `*.manual.test.ts` talks to the real engine, real plugins and paid
        // APIs — run one explicitly: `pnpm exec vitest run test/<name>`.
        exclude: ["**/node_modules/**", "test/**/*.manual.test.ts"],
        environment: "node",
    },
});
