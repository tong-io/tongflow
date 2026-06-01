import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Official TongFlow plugins, cloned at runtime into the gitignored plugins/
// directory. We track each repo's default branch (no pinned ref) so a plain
// `git pull` always lands the latest — zero maintenance, no version bumps here.
const ORG = "https://github.com/tong-io";
const OFFICIAL_PLUGINS = [
    // LLM (text-generation) plugins
    "tongflow-llm-openrouter-free",
    "tongflow-llm-gemini",
    "tongflow-llm-openai",
    // Modal (GPU/CPU) plugins
    "tongflow-modal-ffmpeg",
    "tongflow-modal-pyscenedetect",
    "tongflow-modal-z-image",
    "tongflow-modal-ernie-image",
    "tongflow-modal-flux2-klein9b",
    "tongflow-modal-ltx",
    "tongflow-modal-infinitetalk",
    "tongflow-modal-wan-animate",
    "tongflow-modal-seedvr2",
    "tongflow-modal-color-fix-lab",
    "tongflow-modal-gemma4",
    "tongflow-modal-qwen3asr",
    "tongflow-modal-qwen3tts",
    "tongflow-modal-whisper",
    "tongflow-modal-ace-step",
    "tongflow-modal-docling",
    "tongflow-modal-paddle",
    "tongflow-modal-crawl4ai",
];

function pluginsDir() {
    return path.join(process.cwd(), "plugins");
}

function gitUrl(id) {
    return `${ORG}/${id}.git`;
}

// Clone the plugin if missing, otherwise fast-forward it to the latest commit.
// Returns "cloned" | "updated"; throws on git failure.
function installOne(id) {
    const dest = path.join(pluginsDir(), id);
    if (fs.existsSync(dest)) {
        execFileSync("git", ["pull", "--ff-only"], {
            cwd: dest,
            stdio: "inherit",
        });
        return "updated";
    }
    execFileSync("git", ["clone", gitUrl(id), dest], { stdio: "inherit" });
    return "cloned";
}

function main() {
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
            const action = installOne(id);
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
