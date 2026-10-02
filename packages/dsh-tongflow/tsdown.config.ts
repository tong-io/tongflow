import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "tsdown";

/**
 * Two artifacts, one package:
 *
 *  - `lib/index.js`  — the host (Node) half: a Cordis plugin the dsh Loader
 *    imports by package name (`main`). ESM, deps external, the studio inlined.
 *  - `lib/client.js` — the browser half: a CJS closure-factory bundle in the
 *    exact shape dsh's client module loader expects
 *    (`window.__ModuleLoader__.load({ id, factory: (require) => {...} })`).
 *    Only the shell's platform modules stay external (react, cordis, the
 *    slot/primitives kits); everything else — `tongflow/canvas`, @xyflow,
 *    zustand, use-intl, radix, our own code — is inlined.
 *
 * This mirrors dsh's unpublished `packages/client/tsdown.client.ts` preset.
 */

const PACKAGE_ID = "dsh-tongflow";

/**
 * Module specifiers the dsh web shell shares into the frozen module table.
 * Mirrors `@deepseek-ai/dsh-client-web/src/platform.ts` (`PLATFORM_MODULES`);
 * `ui-dockkit` joins the table in 0.1.3 and is listed ahead of time — an
 * external we never import costs nothing.
 */
const PLATFORM_MODULES = [
    "react",
    "react/jsx-runtime",
    "react-dom",
    "react-dom/client",
    "@deepseek-ai/cordis",
    "@deepseek-ai/dsh-client-store",
    "@deepseek-ai/dsh-client-ui-slots",
    "@deepseek-ai/dsh-client-ui-primitives",
    "@deepseek-ai/dsh-client-ui-dockkit",
] as const;

const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES];

/** Browser-safe dsh wire/type layers a bundle may inline (no shared runtime identity). */
const INLINE_SAFE =
    /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/;
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/;

const CSS_VIRTUAL_PREFIX = "\0dsh-tongflow-css:";
const CSS_VIRTUAL_SUFFIX = ".mjs";

const require = createRequire(import.meta.url);

/**
 * pnpm installs one copy of a package per peer set; `tongflow/canvas` (react 19
 * set) and our own code (react 18 set) would otherwise bundle two copies of
 * use-intl / @xyflow/react / zustand and their React contexts would not match.
 * Resolve every import of these packages from THIS package's own dependency
 * tree, honouring their exports maps.
 */
function dedupePlugin(names: readonly string[]) {
    return {
        name: "dsh-tongflow-dedupe",
        resolveId(source: string) {
            const hit = names.find(
                (n) => source === n || source.startsWith(`${n}/`),
            );
            if (!hit) return null;
            return fileURLToPath(import.meta.resolve(source));
        },
    };
}

/**
 * Turn `import "x.css"` into a JS module that injects the stylesheet as a
 * `<style data-plugin="dsh-tongflow">` tag when the factory executes. Bare
 * package specifiers (e.g. `@xyflow/react/dist/style.css`) resolve through
 * Node so we do not depend on tsdown's own CSS pipeline.
 */
function cssInjectPlugin() {
    return {
        name: "dsh-tongflow-css-inject",
        resolveId(source: string, importer: string | undefined) {
            if (!source.endsWith(".css")) return null;
            let abs: string;
            if (source.startsWith(".") || source.startsWith("/")) {
                abs = importer
                    ? resolvePath(dirname(importer), source)
                    : source;
            } else {
                abs = require.resolve(source);
            }
            return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX;
        },
        async load(
            this: { addWatchFile(id: string): void },
            virtualId: string,
        ) {
            if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null;
            const fileId = virtualId.slice(
                CSS_VIRTUAL_PREFIX.length,
                -CSS_VIRTUAL_SUFFIX.length,
            );
            this.addWatchFile(fileId);
            const css = await readFile(fileId, "utf8");
            const tagId = `${PACKAGE_ID}/${fileId.split("/").slice(-2).join("/")}`;
            return [
                `const css = ${JSON.stringify(css)};`,
                `const tagId = ${JSON.stringify(tagId)};`,
                "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
                "  const tag = document.createElement('style');",
                `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)};`,
                "  tag.dataset.pluginCss = tagId;",
                "  tag.textContent = css;",
                "  document.head.appendChild(tag);",
                "}",
                "export default css;",
            ].join("\n");
        },
    };
}

const host: UserConfig = {
    name: PACKAGE_ID,
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: ["esm"],
    platform: "node",
    target: "es2022",
    fixedExtension: false,
    // `eager`: the studio's sources are inlined from the workspace, and their
    // declarations are only emitted when the whole program is built up front.
    dts: { eager: true },
    sourcemap: false,
    clean: true,
    // Node half: `tongflow` core + dsh peers resolve from the profile's
    // node_modules (peers fall through to the installation via dsh's flat
    // module fallback), so keep them external. `tongflow-studio` (the
    // host-neutral studio, a workspace devDependency) is inlined.
    external: [/^@deepseek-ai\//, /^tongflow(\/|$)/],
};

const nodeEnv = process.env.NODE_ENV ?? "production";

const client: UserConfig = {
    name: `${PACKAGE_ID}/client`,
    entry: { client: "src/client/index.ts" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    target: "es2022",
    dts: false,
    sourcemap: true,
    clean: false,
    // spark (Gaussian splat viewer, ~5 MB, dynamically imported by the 3D model
    // node) stays external: the loader cannot answer it, so that node shows an
    // error boundary instead of dragging it into every page. three is a
    // static import of the canvas and is inlined.
    external: [...CLIENT_EXTERNALS, /^@sparkjsdev\//],
    // uuid's exports map picks the Node build under rolldown's default
    // conditions; force the browser build (no node:crypto).
    alias: {
        uuid: resolvePath(
            dirname(require.resolve("uuid/package.json")),
            "dist/index.js",
        ),
    },
    // zustand / immer read process.env.NODE_ENV; zustand's esm build probes
    // import.meta.env.MODE which a CJS output cannot carry.
    define: {
        "process.env.NODE_ENV": JSON.stringify(nodeEnv),
        "import.meta.env.MODE": JSON.stringify(nodeEnv),
        "import.meta.env": JSON.stringify({ MODE: nodeEnv }),
    },
    // Anything not in the loader module table must be inlined.
    noExternal: (id: string) =>
        CLIENT_EXTERNALS.includes(id) ? undefined : true,
    plugins: [
        {
            name: "dsh-tongflow-bundle-purity",
            resolveId(source: string) {
                if (!source.startsWith("@deepseek-ai/")) return null;
                if (CLIENT_EXTERNALS.includes(source)) return null;
                if (VENDORED_LIBRARY.test(source)) return null;
                if (INLINE_SAFE.test(source)) return null;
                throw new Error(
                    `client bundle purity: "${source}" is neither a platform module nor an inline-safe wire layer; ` +
                        "cross-plugin value imports are forbidden (use type-only imports and cordis services)",
                );
            },
        },
        cssInjectPlugin(),
        dedupePlugin([
            "use-intl",
            "@xyflow/react",
            "zustand",
            "react-hot-toast",
        ]),
    ],
    outputOptions: {
        entryFileNames: "client.js",
        // One file: the loader resolves no chunk graph.
        inlineDynamicImports: true,
        banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
        footer: "return module.exports; } });",
        intro: "var module = { exports: {} }; var exports = module.exports;",
    },
};

export default defineConfig([host, client]);
