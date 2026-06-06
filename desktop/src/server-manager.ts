import { type ChildProcess, spawn } from "node:child_process";
import http from "node:http";
import {
    appResourcesDir,
    bundledNode,
    dataDir,
    pluginsDir,
    serverEntry,
    venvPython,
} from "./paths";
import type { LogLine } from "./proc";

let child: ChildProcess | null = null;

/**
 * Launch the Next.js standalone server with the bundled Node binary, pointing
 * its data/plugins/resources dirs and Python at the desktop locations. The
 * server reads MODAL_TOKEN_* / API keys from the in-app settings store at
 * execution time, so nothing secret needs to be injected here.
 */
export async function startServer(
    port: number,
    onLine: LogLine,
): Promise<void> {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        TONGFLOW_DATA_DIR: dataDir(),
        TONGFLOW_PLUGINS_DIR: pluginsDir(),
        TONGFLOW_RESOURCES_DIR: appResourcesDir(),
        PYTHON: venvPython(),
    };

    child = spawn(bundledNode(), [serverEntry()], {
        cwd: appResourcesDir(),
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (b: Buffer) => onLine(String(b).trimEnd()));
    child.stderr?.on("data", (b: Buffer) => onLine(String(b).trimEnd()));
    child.on("exit", (code) => onLine(`[server] exited with code ${code}`));

    await waitForReady(port, 30_000);
}

/** Poll the server until it answers an HTTP request or we time out. */
function waitForReady(port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const tick = () => {
            const req = http.get(
                { host: "127.0.0.1", port, path: "/", timeout: 2000 },
                (res) => {
                    res.resume();
                    resolve();
                },
            );
            req.on("error", retry);
            req.on("timeout", () => {
                req.destroy();
                retry();
            });
        };
        const retry = () => {
            if (Date.now() > deadline) {
                reject(new Error("Server did not become ready in time"));
                return;
            }
            setTimeout(tick, 300);
        };
        tick();
    });
}

export function stopServer(): void {
    if (!child) return;
    try {
        child.kill();
    } catch {
        // ignore
    }
    child = null;
}
