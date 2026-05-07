import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function modalConfigPath() {
    // Modal CLI writes to ~/.modal.toml (per CLI output).
    return path.join(os.homedir(), ".modal.toml");
}

function hasAnyModalTokenConfig() {
    const p = modalConfigPath();
    if (!fs.existsSync(p)) return false;
    const s = fs.readFileSync(p, "utf8");
    // Keep this intentionally loose; Modal's config structure may evolve.
    // We only need a best-effort "already setup" check.
    return /token/i.test(s) && /profile/i.test(s);
}

function parseTokenFlowUrl(line) {
    const m = line.match(/https:\/\/modal\.com\/token-flow\/[A-Za-z0-9-_]+/);
    return m?.[0] ?? null;
}

function openUrl(url) {
    const platform = process.platform;
    try {
        if (platform === "darwin") {
            execFileSync("open", [url], { stdio: "ignore" });
            return true;
        }
        if (platform === "win32") {
            execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
            return true;
        }
        execFileSync("xdg-open", [url], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

function getArgValue(flag) {
    const idx = process.argv.indexOf(flag);
    if (idx === -1) return null;
    return process.argv[idx + 1] ?? null;
}

const profile =
    getArgValue("--profile") ??
    process.env.MODAL_PROFILE ??
    process.env.MODAL_WORKSPACE ??
    null;

if (process.env.CI) {
    console.warn(
        "[modal] Detected CI environment. Interactive `modal setup` usually won't work. Prefer setting Modal secrets via CI instead.",
    );
}

if (hasAnyModalTokenConfig()) {
    console.log(`[modal] Already set up (${modalConfigPath()}).`);
    process.exit(0);
}

const args = ["setup"];
if (profile) args.push("--profile", profile);

console.log("[modal] Running interactive setup...");
const child = spawn("modal", args, { stdio: ["inherit", "pipe", "pipe"] });

let opened = false;
function onChunk(chunk) {
    const text = chunk.toString("utf8");
    process.stdout.write(text);
    if (!opened) {
        const url = parseTokenFlowUrl(text);
        if (url) {
            opened = openUrl(url);
            if (opened)
                console.log("\n[modal] Opened browser for authentication.\n");
            else
                console.log(
                    `\n[modal] Please open this URL manually to authenticate:\n${url}\n`,
                );
        }
    }
}

child.stdout.on("data", onChunk);
child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    process.stderr.write(text);
    if (!opened) {
        const url = parseTokenFlowUrl(text);
        if (url) {
            opened = openUrl(url);
            if (opened)
                console.log("\n[modal] Opened browser for authentication.\n");
            else
                console.log(
                    `\n[modal] Please open this URL manually to authenticate:\n${url}\n`,
                );
        }
    }
});

child.on("close", (code) => {
    if (code !== 0) {
        console.error(`[modal] Setup failed (exit code ${code ?? "unknown"}).`);
        process.exit(code ?? 1);
    }
    if (!fs.existsSync(modalConfigPath())) {
        console.error(
            `[modal] Setup completed but ${modalConfigPath()} was not found. Please re-run \`modal setup\` and check your Modal CLI installation.`,
        );
        process.exit(1);
    }
    console.log(
        `[modal] Setup complete. Config saved at ${modalConfigPath()}.`,
    );
});
