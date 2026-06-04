// Assemble resources/app/ — the read-only bundle the packaged server runs from.
//
// next build (output: "standalone") only traces node_modules; the runtime fs
// assets (drizzle migrations, config/, sdk/, public, static) must be copied in
// by hand. We also stage the LLM plugins as first-run seeds.
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
const seedOut = path.join(desktopDir, "resources", "seed-plugins");
const wheelsOut = path.join(desktopDir, "resources", "wheels");

function rmrf(p) {
    fs.rmSync(p, { recursive: true, force: true });
}
function copy(from, to) {
    if (!fs.existsSync(from)) {
        throw new Error(`Missing build input: ${from}`);
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
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

function assembleApp() {
    console.log("[assemble] cleaning", appOut);
    rmrf(appOut);

    console.log("[assemble] copying Next standalone bundle");
    copy(path.join(repoRoot, ".next", "standalone"), appOut);

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
    copy(path.join(repoRoot, "sdk"), path.join(appOut, "sdk"));
}

function seedPlugins() {
    rmrf(seedOut);
    const pluginsDir = path.join(repoRoot, "plugins");
    if (!fs.existsSync(pluginsDir)) {
        console.warn(
            "[assemble] no plugins/ dir — run `pnpm plugins:install` to seed LLM plugins",
        );
        return;
    }
    fs.mkdirSync(seedOut, { recursive: true });
    let n = 0;
    for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
        // Only LLM plugins run locally and are safe to ship; Modal plugins are
        // cloned on demand from the in-app plugin manager.
        if (!entry.isDirectory() || !entry.name.startsWith("tongflow-llm-")) {
            continue;
        }
        fs.cpSync(
            path.join(pluginsDir, entry.name),
            path.join(seedOut, entry.name),
            { recursive: true },
        );
        n++;
    }
    console.log(`[assemble] seeded ${n} LLM plugin(s)`);
}

function buildWheelhouse() {
    // Optional: a complete offline wheelhouse makes first-run pip install work
    // without network. Best-effort — falls back to online install if skipped.
    if (process.env.TONGFLOW_SKIP_WHEELS === "1") {
        console.log("[assemble] skipping wheelhouse (TONGFLOW_SKIP_WHEELS=1)");
        return;
    }
    fs.mkdirSync(wheelsOut, { recursive: true });
    const deps = ["openai", "google-genai", "modal", "requests"];
    try {
        console.log("[assemble] building tongflow wheel");
        execSync(`uv build "${path.join(repoRoot, "sdk")}" -o "${wheelsOut}"`, {
            stdio: "inherit",
        });
        console.log("[assemble] downloading dependency wheels");
        execSync(`uv pip download ${deps.join(" ")} -d "${wheelsOut}"`, {
            stdio: "inherit",
        });
    } catch (e) {
        console.warn(
            "[assemble] wheelhouse build failed; first run will install online:",
            e.message,
        );
    }
}

assertBuilt();
assembleApp();
seedPlugins();
buildWheelhouse();
console.log("[assemble] done →", appOut);
