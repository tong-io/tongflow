/**
 * Bundler plugins shared by the two browser builds of the Studio UI: the
 * standalone page in this package and the dsh client bundle in dsh-tongflow.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const CSS_VIRTUAL_PREFIX = "\0tongflow-studio-css:";
const CSS_VIRTUAL_SUFFIX = ".mjs";

/**
 * pnpm installs one copy of a package per peer set; `tongflow/canvas` (react 19
 * set) and the Studio's own code (react 18 set) would otherwise bundle two
 * copies of use-intl / @xyflow/react / zustand and their React contexts would
 * not match. Resolve every import of these packages through `resolve` — the
 * building package's own `import.meta.resolve`, so its dependency tree wins.
 */
export function dedupePlugin(
    names: readonly string[],
    resolve: (specifier: string) => string,
) {
    return {
        name: "tongflow-studio-dedupe",
        resolveId(source: string) {
            const hit = names.find(
                (n) => source === n || source.startsWith(`${n}/`),
            );
            if (!hit) return null;
            return fileURLToPath(resolve(source));
        },
    };
}

/**
 * Turn `import "x.css"` into a JS module that injects the stylesheet as a
 * `<style data-plugin="<packageId>">` tag when it executes. Bare package
 * specifiers (e.g. `@xyflow/react/dist/style.css`) resolve through
 * `requireResolve` — the building package's own `require.resolve` — so we do
 * not depend on the bundler's CSS pipeline.
 */
export function cssInjectPlugin(
    packageId: string,
    requireResolve: (specifier: string) => string,
) {
    return {
        name: "tongflow-studio-css-inject",
        resolveId(source: string, importer: string | undefined) {
            if (!source.endsWith(".css")) return null;
            let abs: string;
            if (source.startsWith(".") || source.startsWith("/")) {
                abs = importer
                    ? resolvePath(dirname(importer), source)
                    : source;
            } else {
                abs = requireResolve(source);
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
            const tagId = `${packageId}/${fileId.split("/").slice(-2).join("/")}`;
            return [
                `const css = ${JSON.stringify(css)};`,
                `const tagId = ${JSON.stringify(tagId)};`,
                "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
                "  const tag = document.createElement('style');",
                `  tag.dataset.plugin = ${JSON.stringify(packageId)};`,
                "  tag.dataset.pluginCss = tagId;",
                "  tag.textContent = css;",
                "  document.head.appendChild(tag);",
                "}",
                "export default css;",
            ].join("\n");
        },
    };
}
