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
let stopping = false;

/**
 * Launch the Next.js standalone server with the bundled Node binary, pointing
 * its data/plugins/resources dirs and Python at the desktop locations. The
 * server reads MODAL_TOKEN_* / API keys from the in-app settings store at
 * execution time, so nothing secret needs to be injected here.
 *
 * `onCrash` fires if the server process exits after a successful start (i.e.
 * not via stopServer) so the shell can surface the failure to the user.
 */
export async function startServer(
    port: number,
    onLine: LogLine,
    onCrash?: (code: number | null) => void,
): Promise<void> {
    stopping = false;

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
    child.on("exit", (code) => {
        onLine(`[server] exited with code ${code}`);
        child = null;
        if (!stopping) onCrash?.(code);
    });

    await waitForReady(port, 30_000);
}

/**
 * Poll the server until it serves a real page. A 5xx response means the
 * process is up but the app is broken (e.g. a bad bundle) — keep polling and,
 * if it never recovers, fail loudly instead of presenting an error page as a
 * "ready" app.
 */
function waitForReady(port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastStatus: number | null = null;
    return new Promise((resolve, reject) => {
        const tick = () => {
            const req = http.get(
                { host: "127.0.0.1", port, path: "/", timeout: 2000 },
                (res) => {
                    res.resume();
                    lastStatus = res.statusCode ?? null;
                    if (lastStatus !== null && lastStatus < 500) resolve();
                    else retry();
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
                reject(
                    new Error(
                        lastStatus !== null
                            ? `Server is running but responds with HTTP ${lastStatus}`
                            : "Server did not become ready in time",
                    ),
                );
                return;
            }
            setTimeout(tick, 300);
        };
        tick();
    });
}

export function stopServer(): void {
    stopping = true;
    if (!child) return;
    try {
        child.kill();
    } catch {
        // ignore
    }
    child = null;
}
