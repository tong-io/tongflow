import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { defineConfig, type UserConfig } from "tsdown";
import { cssInjectPlugin, dedupePlugin } from "./bundler/client-plugins.ts";

/**
 * Two builds:
 *
 *  - Node (`dist/`): `index` — the library a host imports (Studio, StudioApi,
 *    the tools, the HTTP route handler, the MCP and web servers); `shared` —
 *    the data shapes a browser UI shares with it; `cli` — the
 *    `tongflow-studio` bin. `tongflow` (the workflow core) stays external: it
 *    is a dependency.
 *  - Browser (`dist/web/`): the Studio page `serve.ts` serves. Everything is
 *    inlined — React, `tongflow/canvas`, @xyflow — because the page loads
 *    from a local server with nothing else to resolve a module.
 */

const require = createRequire(import.meta.url);
const nodeEnv = process.env.NODE_ENV ?? "production";

const node: UserConfig = {
    name: "tongflow-studio",
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
};

const web: UserConfig = {
    name: "tongflow-studio/web",
    entry: { studio: "src/client/standalone.tsx" },
    outDir: "dist/web",
    format: "esm",
    platform: "browser",
    target: "es2022",
    tsconfig: "tsconfig.client.json",
    dts: false,
    sourcemap: false,
    minify: true,
    // dist/ was cleaned by the Node build, which runs first.
    clean: false,
    // uuid's exports map picks the Node build under rolldown's default
    // conditions; force the browser build (no node:crypto).
    alias: {
        uuid: resolvePath(
            dirname(require.resolve("uuid/package.json")),
            "dist/index.js",
        ),
    },
    // zustand / immer read process.env.NODE_ENV; zustand's esm build probes
    // import.meta.env.MODE.
    define: {
        "process.env.NODE_ENV": JSON.stringify(nodeEnv),
        "import.meta.env.MODE": JSON.stringify(nodeEnv),
        "import.meta.env": JSON.stringify({ MODE: nodeEnv }),
    },
    noExternal: () => true,
    plugins: [
        cssInjectPlugin("tongflow-studio", (s) => require.resolve(s)),
        // React itself too: the page has no host supplying one, and the
        // canvas would otherwise bring its own copy beside ours.
        dedupePlugin(
            [
                "react",
                "react-dom",
                "use-intl",
                "@xyflow/react",
                "zustand",
                "react-hot-toast",
            ],
            (s) => import.meta.resolve(s),
        ),
    ],
    outputOptions: {
        entryFileNames: "studio.js",
        chunkFileNames: "[name]-[hash].js",
    },
};

export default defineConfig([node, web]);
