import fs from "node:fs";
import path from "node:path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";

// Official TongFlow plugins, cloned at runtime into the gitignored plugins/
// directory. We track each repo's default branch (no pinned ref) so a plain
// `git pull` always lands the latest — zero maintenance, no version bumps here.
// The canonical list lives in config/official-plugins.json so the in-app plugin
// manager API (src/lib/plugins/official-plugins.server.ts) reads the same source.
// Mirror src/lib/runtime/paths.server.ts so build-time seeding can target the
// same relocated directories the packaged app uses.
const resourcesDir = process.env.TONGFLOW_RESOURCES_DIR?.trim()
    ? path.resolve(process.env.TONGFLOW_RESOURCES_DIR.trim())
    : process.cwd();

const manifest = JSON.parse(
    fs.readFileSync(
        path.join(resourcesDir, "config", "official-plugins.json"),
        "utf8",
    ),
);
const ORG = manifest.org;
const OFFICIAL_PLUGINS = manifest.plugins;

function pluginsDir() {
    return process.env.TONGFLOW_PLUGINS_DIR?.trim()
        ? path.resolve(process.env.TONGFLOW_PLUGINS_DIR.trim())
        : path.join(process.cwd(), "plugins");
}

function gitUrl(id) {
    return `${ORG}/${id}.git`;
}

// Clone the plugin if missing, otherwise fast-forward it to the latest commit.
// Uses isomorphic-git (pure JS) so no system git binary is required.
// Returns "cloned" | "updated"; throws on git failure.
async function installOne(id) {
    const dir = path.join(pluginsDir(), id);
    if (fs.existsSync(dir)) {
        await git.pull({
            fs,
            http,
            dir,
            singleBranch: true,
            fastForward: true,
            author: { name: "tongflow", email: "tongflow@local" },
        });
        return "updated";
    }
    await git.clone({ fs, http, dir, url: gitUrl(id), singleBranch: true });
    return "cloned";
}

async function main() {
    const requested = process.argv.slice(2);
    const targets = requested.length ? requested : OFFICIAL_PLUGINS;

    const unknown = requested.filter((id) => !OFFICIAL_PLUGINS.includes(id));
    if (unknown.length) {
        console.error(
            `[install-plugins] Unknown plugin(s): ${unknown.join(", ")}`,
        );
        console.error(
            `[install-plugins] Available: ${OFFICIAL_PLUGINS.join(", ")}`,
        );
        process.exit(1);
    }

    fs.mkdirSync(pluginsDir(), { recursive: true });
    console.log(`[install-plugins] Installing ${targets.length} plugin(s)…`);

    const failed = [];
    for (const id of targets) {
        try {
            const action = await installOne(id);
            console.log(`[install-plugins] ${action}: ${id}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[install-plugins] FAILED: ${id} — ${msg}`);
            failed.push(id);
        }
    }

    const ok = targets.length - failed.length;
    console.log(`[install-plugins] Done — ${ok} ok, ${failed.length} failed.`);
    if (failed.length) process.exit(1);
}

main();
