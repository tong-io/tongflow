// Assemble resources/app/ — the read-only bundle the packaged server runs from.
//
// next build (output: "standalone") only traces node_modules; the runtime fs
// assets (drizzle migrations, config/, sdk/, public, static) must be copied in
// by hand. Plugins are NOT bundled — the user installs them on demand in-app.
//
// Run AFTER `pnpm --dir <repo> build`. Invoked by `pnpm assemble`.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const repoRoot = path.resolve(desktopDir, "..");

const appOut = path.join(desktopDir, "resources", "app");
const wheelsOut = path.join(desktopDir, "resources", "wheels");

function rmrf(p) {
    fs.rmSync(p, { recursive: true, force: true });
}
/**
 * Recursive copy that materializes symlinks into real files. pnpm lays out
 * node_modules as symlinks (and Next's standalone output keeps them); copying
 * them verbatim ships links into the build machine's filesystem, which dangle
 * on every other machine. fs.cpSync's `dereference: true` does NOT dereference
 * directory symlinks (nodejs/node behavior as of v24), so walk by hand:
 * statSync/copyFileSync follow links, producing a fully self-contained tree.
 * A dangling link throws ENOENT with the offending path — fail loudly.
 */
function copy(from, to, filter) {
    if (!fs.existsSync(from)) {
        throw new Error(`Missing build input: ${from}`);
    }
    if (filter && !filter(from)) return;
    const st = fs.statSync(from);
    if (st.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        for (const name of fs.readdirSync(from)) {
            copy(path.join(from, name), path.join(to, name), filter);
        }
    } else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        fs.chmodSync(to, st.mode);
    }
}

// Dev artifacts inside sdk/ (virtualenv, caches, build output) must not ship.
const SDK_EXCLUDE = new Set([
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "dist",
    "build",
]);

function copySdk(from, to) {
    copy(from, to, (src) => {
        const base = path.basename(src);
        return !SDK_EXCLUDE.has(base) && !base.endsWith(".egg-info");
    });
}

/** The bundle must be self-contained — any surviving symlink is a packaging bug. */
function assertNoSymlinks(root) {
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop();
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, ent.name);
            if (ent.isSymbolicLink()) {
                throw new Error(`Symlink leaked into bundle: ${p}`);
            }
            if (ent.isDirectory()) stack.push(p);
        }
    }
}

function assertBuilt() {
    const standalone = path.join(repoRoot, ".next", "standalone");
    if (!fs.existsSync(path.join(standalone, "server.js"))) {
        throw new Error(
            "No .next/standalone/server.js — run `pnpm --dir .. build` first " +
                "(ensure next.config has output: 'standalone').",
        );
    }
}

/**
 * Rebuild a pnpm-style node_modules (symlinks into a `.pnpm` virtual store)
 * as a flat, hoisted, symlink-free layout. Materializing the symlinks in
 * place doesn't work — a package's deps live as *siblings* in its store dir,
 * so a flattened `node_modules/next` would no longer resolve styled-jsx.
 * Hoisting every real package dir to the top level keeps Node resolution
 * working (the traced standalone output has no duplicate package versions)
 * and is portable to platforms without symlink support.
 */
function hoistNodeModules(srcNM, dstNM) {
    const entries = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
    const copyPkg = (from, to) => {
        if (fs.lstatSync(from).isSymbolicLink()) return; // covered by its store dir
        if (!fs.existsSync(to)) copy(from, to);
    };
    const copyLevel = (nm, dst) => {
        for (const name of entries(nm)) {
            if (name === ".pnpm") continue;
            const p = path.join(nm, name);
            if (name.startsWith("@") && !fs.lstatSync(p).isSymbolicLink()) {
                for (const sub of entries(p)) {
                    copyPkg(path.join(p, sub), path.join(dst, name, sub));
                }
            } else {
                copyPkg(p, path.join(dst, name));
            }
        }
    };
    // Real top-level entries (npm/hoisted layouts pass through unchanged) …
    copyLevel(srcNM, dstNM);
    // … then every real package dir from the pnpm virtual store.
    const pnpmDir = path.join(srcNM, ".pnpm");
    for (const id of entries(pnpmDir)) {
        copyLevel(path.join(pnpmDir, id, "node_modules"), dstNM);
    }
}

function assembleApp() {
    console.log("[assemble] cleaning", appOut);
    rmrf(appOut);

    console.log("[assemble] copying Next standalone bundle");
    const standalone = path.join(repoRoot, ".next", "standalone");
    const topNM = path.join(standalone, "node_modules");
    // Belt and braces with next.config's outputFileTracingExcludes: tracing
    // must never ship dev-machine state (SQLite db, uploads, installed
    // plugins) or a previously-assembled desktop bundle.
    const skip = new Set(
        ["node_modules", "data", "plugins", "desktop"].map((d) =>
            path.join(standalone, d),
        ),
    );
    copy(standalone, appOut, (src) => !skip.has(src));

    console.log("[assemble] hoisting node_modules to a flat layout");
    hoistNodeModules(topNM, path.join(appOut, "node_modules"));

    console.log("[assemble] copying static + public");
    copy(
        path.join(repoRoot, ".next", "static"),
        path.join(appOut, ".next", "static"),
    );
    if (fs.existsSync(path.join(repoRoot, "public"))) {
        copy(path.join(repoRoot, "public"), path.join(appOut, "public"));
    }

    console.log("[assemble] copying runtime fs assets (drizzle/config/sdk)");
    copy(path.join(repoRoot, "drizzle"), path.join(appOut, "drizzle"));
    copy(path.join(repoRoot, "config"), path.join(appOut, "config"));
    copySdk(path.join(repoRoot, "sdk"), path.join(appOut, "sdk"));
}

function buildWheelhouse() {
    // Optional: a complete offline wheelhouse makes first-run pip install work
    // without network. Best-effort — falls back to online install if skipped.
    if (process.env.TONGFLOW_SKIP_WHEELS === "1") {
        console.log("[assemble] skipping wheelhouse (TONGFLOW_SKIP_WHEELS=1)");
        return;
    }
    // The bundled python (from `pnpm fetch-runtimes`) is used to download wheels
    // for the exact target platform/arch. Skip if it isn't present yet.
    const py =
        process.platform === "win32"
            ? path.join(desktopDir, "resources", "python", "python.exe")
            : path.join(desktopDir, "resources", "python", "bin", "python3");
    if (!fs.existsSync(py)) {
        console.warn(
            "[assemble] no bundled python (run `pnpm fetch-runtimes`) — " +
                "skipping wheelhouse; first run will install online",
        );
        return;
    }

    fs.mkdirSync(wheelsOut, { recursive: true });
    // Must match INSTALL in src/python-manager.ts. tongflow itself is imported
    // from source via PYTHONPATH, so only its deps are needed here.
    const deps = [
        "modal",
        // Must stay in sync with the cbor2 constraint in python-manager.ts.
        "cbor2==5.6.5",
        "pydantic>=2.0",
        "typing_extensions>=4.12",
        "openai",
        "google-genai",
        "requests",
    ];
    try {
        // Download the full transitive closure for the target platform/arch
        // using the bundled python's pip (no uv / network-PATH assumptions).
        // --only-binary: an sdist in the wheelhouse is worse than useless —
        // the offline install then tries to build it on the user's machine.
        // Quote each spec: version markers like `pydantic>=2.0` contain `>`,
        // which the shell would otherwise treat as a redirect.
        const specs = deps.map((d) => `"${d}"`).join(" ");
        console.log("[assemble] downloading dependency wheels");
        execSync(
            `"${py}" -m pip download --only-binary ":all:" --dest "${wheelsOut}" ${specs}`,
            { stdio: "inherit" },
        );
    } catch (e) {
        // A partial wheelhouse would make the offline install fail on the
        // user's machine; drop it entirely so first run installs online.
        rmrf(wheelsOut);
        console.warn(
            "[assemble] wheelhouse build failed; first run will install online:",
            e.message,
        );
    }
}

assertBuilt();
assembleApp();
assertNoSymlinks(appOut);
buildWheelhouse();
console.log("[assemble] done →", appOut);
