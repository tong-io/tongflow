// Smoke-test the assembled bundle (resources/app) exactly the way the desktop
// shell runs it: bundled Node, desktop env vars, then require a non-5xx
// response from "/". Catches broken bundles (dangling symlinks, Next version
// skew, missing assets) before they ship.
//
// Run AFTER `pnpm fetch-runtimes` and `pnpm assemble`. Invoked by `pnpm smoke`.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const resources = path.resolve(here, "..", "resources");
const isWin = process.platform === "win32";
const bundledNode = path.join(resources, "node", isWin ? "node.exe" : "node");
const serverEntry = path.join(resources, "app", "server.js");

for (const p of [bundledNode, serverEntry]) {
    if (!fs.existsSync(p)) {
        console.error(
            `[smoke] missing ${p} — run fetch-runtimes + assemble first`,
        );
        process.exit(1);
    }
}

const PORT = 4978;
const TIMEOUT_MS = 60_000;

// Throwaway user-state dirs; the venv path is only consumed at task execution
// time, so a placeholder is fine for page rendering.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tongflow-smoke-"));
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
fs.mkdirSync(path.join(tmp, "plugins"), { recursive: true });

const child = spawn(bundledNode, [serverEntry], {
    cwd: path.join(resources, "app"),
    env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        TONGFLOW_DATA_DIR: path.join(tmp, "data"),
        TONGFLOW_PLUGINS_DIR: path.join(tmp, "plugins"),
        TONGFLOW_RESOURCES_DIR: path.join(resources, "app"),
        PYTHON: path.join(tmp, "venv-placeholder", "python"),
    },
    stdio: ["ignore", "inherit", "inherit"],
});

function finish(code, message) {
    console.log(`[smoke] ${message}`);
    child.kill();
    process.exit(code);
}

child.on("exit", (code) => {
    // Only an error if it dies before the probe finishes.
    finish(1, `server exited prematurely with code ${code}`);
});

const deadline = Date.now() + TIMEOUT_MS;

function probe() {
    const req = http.get(
        { host: "127.0.0.1", port: PORT, path: "/", timeout: 2000 },
        (res) => {
            res.resume();
            const status = res.statusCode ?? 0;
            if (status < 500) {
                child.removeAllListeners("exit");
                finish(0, `OK — GET / responded with HTTP ${status}`);
            } else {
                retry(`HTTP ${status}`);
            }
        },
    );
    req.on("error", (e) => retry(e.code ?? String(e)));
    req.on("timeout", () => {
        req.destroy();
        retry("request timeout");
    });
}

function retry(reason) {
    if (Date.now() > deadline) {
        child.removeAllListeners("exit");
        finish(1, `server never served a non-5xx page (last: ${reason})`);
    } else {
        setTimeout(probe, 500);
    }
}

probe();
