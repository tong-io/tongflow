import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
import { execFile } from "node:child_process";
import dotenv from "dotenv";

function isDev(): boolean {
    return process.env.ELECTRON_DEV === "1" || !app.isPackaged;
}

// Ensure single-instance behavior (prevents duplicate Dock icons / bouncing).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
}

function platformKey(): "darwin" | "win32" {
    if (process.platform === "darwin") return "darwin";
    if (process.platform === "win32") return "win32";
    throw new Error(`Unsupported platform: ${process.platform}`);
}

function getEmbeddedNodeExecutable(): string {
    const base = isDev()
        ? path.join(process.cwd(), "dist-electron", "node", platformKey())
        : path.join(process.resourcesPath, "node", platformKey());

    const candidates =
        process.platform === "win32"
            ? [
                  // node-vX.Y.Z-win-x64/node.exe
                  path.join(base, "node.exe"),
                  path.join(base, "node-v24.12.0-win-x64", "node.exe"),
              ]
            : [
                  // node-vX.Y.Z-darwin-arm64/bin/node
                  path.join(base, "bin", "node"),
                  path.join(base, "node-v24.12.0-darwin-arm64", "bin", "node"),
              ];

    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    throw new Error(
        `Embedded node not found. Looked in:\n${candidates.join("\n")}`,
    );
}

function getEmbeddedPythonExecutable(): string {
    const base = isDev()
        ? path.join(process.cwd(), "dist-electron", "python", platformKey())
        : path.join(process.resourcesPath, "python", platformKey());

    // python-build-standalone "install_only" layouts place python under python/bin.
    // Windows uses python.exe.
    const candidates =
        process.platform === "win32"
            ? [
                  path.join(base, "python", "python.exe"),
                  path.join(base, "python.exe"),
              ]
            : [
                  path.join(base, "python", "bin", "python3"),
                  path.join(base, "python", "bin", "python"),
              ];

    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    throw new Error(
        `Embedded python not found. Looked in:\n${candidates.join("\n")}`,
    );
}

function getWheelhouseDir(): string {
    const base = isDev()
        ? path.join(process.cwd(), "dist-electron", "wheelhouse", platformKey())
        : path.join(process.resourcesPath, "wheelhouse", platformKey());
    if (!fs.existsSync(base)) {
        throw new Error(`Wheelhouse not found: ${base}`);
    }
    return base;
}

function execFileP(
    file: string,
    args: string[],
    opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
    return new Promise((resolve, reject) => {
        execFile(
            file,
            args,
            { ...opts, windowsHide: true },
            (err, stdout, stderr) => {
                if (isDev()) {
                    if (stdout) process.stdout.write(stdout);
                    if (stderr) process.stderr.write(stderr);
                }
                if (err) reject(err);
                else resolve();
            },
        );
    });
}

async function ensureModalInstalledOffline(): Promise<string> {
    const python = getEmbeddedPythonExecutable();
    const wheelhouse = getWheelhouseDir();

    // Create a per-user venv and install modal from wheelhouse (offline).
    const userData = app.getPath("userData");
    const venvDir = path.join(userData, "pyenv");
    const marker = path.join(venvDir, ".openflow_modal_ok");

    const venvPython =
        process.platform === "win32"
            ? path.join(venvDir, "Scripts", "python.exe")
            : path.join(venvDir, "bin", "python3");

    if (!fs.existsSync(marker)) {
        fs.mkdirSync(venvDir, { recursive: true });

        // 1) Create venv
        await execFileP(python, ["-m", "venv", venvDir]);

        // 2) Offline install modal (pinned loosely; you can pin tighter in CI)
        await execFileP(venvPython, [
            "-m",
            "pip",
            "install",
            "--no-index",
            "--find-links",
            wheelhouse,
            "modal",
        ]);

        fs.writeFileSync(marker, "ok\n");
    }

    return venvPython;
}

async function findFreePort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (address && typeof address === "object") {
                const port = address.port;
                server.close(() => resolve(port));
                return;
            }
            server.close(() => reject(new Error("Failed to acquire a port")));
        });
    });
}

function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            const elapsed = Date.now() - start;
            if (elapsed > timeoutMs) {
                reject(new Error(`Timed out waiting for server: ${url}`));
                return;
            }

            const req = http.get(url, (res) => {
                // Any 2xx/3xx means server is alive; Next may redirect / -> /workspace.
                const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 400;
                res.resume();
                if (ok) {
                    resolve();
                } else {
                    setTimeout(tick, 200);
                }
            });

            req.on("error", () => setTimeout(tick, 200));
            req.end();
        };

        tick();
    });
}

function getStandaloneDir(): string {
    if (isDev()) {
        return path.join(process.cwd(), ".next", "standalone");
    }
    // In production, the standalone output is bundled under app.asar.unpacked (asarUnpack).
    return path.join(process.resourcesPath, "app.asar.unpacked", "dist-electron", "app");
}

function assertExists(p: string, label: string) {
    if (!fs.existsSync(p)) {
        throw new Error(`${label} not found: ${p}`);
    }
}

function loadDotenvFiles(): void {
    // Load tokens from either:
    // - userData/.env (preferred for desktop)
    // - app directory .env (next to executable)
    //
    // This keeps "only use .env MODAL_TOKEN_ID/SECRET" consistent.
    try {
        const userEnv = path.join(app.getPath("userData"), ".env");
        if (fs.existsSync(userEnv)) dotenv.config({ path: userEnv });
    } catch {
        // ignore
    }
    try {
        const appDir = path.dirname(process.execPath);
        const appEnv = path.join(appDir, ".env");
        if (fs.existsSync(appEnv)) dotenv.config({ path: appEnv });
    } catch {
        // ignore
    }
}

function getModalSourceDir(): string {
    if (isDev()) return path.join(process.cwd(), "modal");
    return path.join(process.resourcesPath, "modal");
}

function listModalEntryFiles(): string[] {
    const modalDir = getModalSourceDir();
    const cpuDir = path.join(modalDir, "cpu");
    const gpuDir = path.join(modalDir, "gpu");
    const files: string[] = [];

    const pushPyFiles = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            if (name.endsWith(".py")) files.push(path.join(dir, name));
        }
    };
    pushPyFiles(cpuDir);
    pushPyFiles(gpuDir);
    return files.sort();
}

function requireModalTokenEnv() {
    const id = process.env.MODAL_TOKEN_ID?.trim();
    const secret = process.env.MODAL_TOKEN_SECRET?.trim();
    if (!id || !secret) {
        throw new Error(
            "Missing Modal credentials. Please set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in a .env file.\n\n" +
                "For desktop builds, you can put .env in:\n" +
                `- ${path.join(app.getPath("userData"), ".env")}\n` +
                `- ${path.join(path.dirname(process.execPath), ".env")}`,
        );
    }
}

function startNextServer(port: number): ChildProcess {
    const standaloneDir = getStandaloneDir();
    const serverJs = path.join(standaloneDir, "server.js");
    assertExists(serverJs, "Next standalone server");

    const logPath = path.join(app.getPath("userData"), "next-server.log");
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const log = (prefix: string, buf: Buffer) => {
        const line = `[${new Date().toISOString()}] ${prefix}${String(buf)}`;
        logStream.write(line);
        if (isDev()) process.stdout.write(line);
    };

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
    };

    const nodeExe = getEmbeddedNodeExecutable();
    const child = spawn(nodeExe, [serverJs], {
        cwd: standaloneDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });

    child.stdout?.on("data", (buf: Buffer) => log("[next] ", buf));
    child.stderr?.on("data", (buf: Buffer) => log("[next:err] ", buf));

    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
        logStream.end();
        if (isDev())
            console.log(`[next] exited code=${code} signal=${signal}`);
    });

    return child;
}

let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;
let modalSetupRunning = false;

app.on("second-instance", () => {
    // Someone tried to run a second instance, focus existing window.
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
});

async function createWindow() {
    const port = await findFreePort();
    nextProcess = startNextServer(port);

    const url = `http://127.0.0.1:${port}/`;
    await waitForHttpOk(url, 30_000);

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: "#0b0b0b",
        webPreferences: {
            // Keep it simple for now; no Node in renderer.
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, "preload.js"),
        },
    });

    await mainWindow.loadURL(url);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

async function maybeDeployModalWorkers(): Promise<void> {
    // Deprecated: keep for backward compatibility if referenced elsewhere.
    // Modal bootstrap is now performed on-demand when the user clicks "Deploy Modal Workers".
    return;
}

function cleanup() {
    if (nextProcess && !nextProcess.killed) {
        try {
            if (process.platform === "win32" && nextProcess.pid) {
                // Ensure child tree is terminated on Windows.
                spawn("taskkill", ["/pid", String(nextProcess.pid), "/t", "/f"], {
                    stdio: "ignore",
                    windowsHide: true,
                });
            } else {
                nextProcess.kill();
            }
        } catch {
            // ignore
        }
    }
    nextProcess = null;
}

async function deployModalWorkers(): Promise<void> {
    loadDotenvFiles();
    requireModalTokenEnv();

    const venvPython = await ensureModalInstalledOffline();
    const files = listModalEntryFiles();
    if (files.length === 0) {
        throw new Error("No Modal python entry files found to deploy.");
    }

    for (const file of files) {
        mainWindow?.webContents.send("modal:deploy:log", `Deploying: ${file}`);
        await new Promise<void>((resolve, reject) => {
            const child = spawn(
                venvPython,
                ["-m", "modal", "deploy", file],
                {
                    cwd: path.dirname(file),
                    env: process.env,
                    windowsHide: true,
                    stdio: ["ignore", "pipe", "pipe"],
                },
            );

            const forward = (prefix: string, buf: Buffer) => {
                const text = String(buf);
                for (const line of text.split(/\r?\n/)) {
                    if (!line.trim()) continue;
                    mainWindow?.webContents.send(
                        "modal:deploy:log",
                        `${prefix}${line}`,
                    );
                }
            };
            child.stdout?.on("data", (b: Buffer) => forward("", b));
            child.stderr?.on("data", (b: Buffer) => forward("[err] ", b));

            child.on("error", (e) => reject(e));
            child.on("exit", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`modal deploy failed (${code}) for ${file}`));
            });
        });
    }
}

app.on("window-all-closed", () => {
    cleanup();
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", () => {
    cleanup();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
    }
});

app.whenReady().then(() => {
    void createWindow().catch(async (err) => {
        const detail = err instanceof Error ? err.message : String(err);
        const logPath = path.join(app.getPath("userData"), "next-server.log");
        await dialog.showMessageBox({
            type: "error",
            title: "OpenFlow failed to start",
            message:
                "OpenFlow could not start the local server needed for the UI.",
            detail: `${detail}\n\nLogs: ${logPath}`,
        });
        app.quit();
    });
});

process.on("unhandledRejection", (reason) => {
    const detail =
        reason instanceof Error ? reason.stack ?? reason.message : String(reason);
    // Best-effort log; don't crash silently.
    try {
        const p = path.join(app.getPath("userData"), "electron-unhandled.log");
        fs.appendFileSync(p, `${new Date().toISOString()} ${detail}\n`);
    } catch {
        // ignore
    }
});

ipcMain.handle("modal:deploy", async () => {
    if (!mainWindow) throw new Error("Window not ready");
    await deployModalWorkers();
});

function modalTomlPath(): string {
    // modal CLI writes here on mac/linux; on windows it should still be under user profile.
    return path.join(app.getPath("home"), ".modal.toml");
}

function parseTokenFlowUrl(text: string): string | null {
    const m = text.match(/https:\/\/modal\.com\/token-flow\/[A-Za-z0-9-_]+/);
    return m?.[0] ?? null;
}

ipcMain.handle(
    "modal:setup",
    async (_evt, opts?: { profile?: string | null }) => {
        if (!mainWindow) throw new Error("Window not ready");
        if (modalSetupRunning) {
            throw new Error("Modal setup is already running");
        }
        modalSetupRunning = true;

        const send = (payload: unknown) => {
            mainWindow?.webContents.send("modal:setup:event", payload);
        };

        try {
            send({ type: "starting" });

            const toml = modalTomlPath();
            if (fs.existsSync(toml)) {
                send({ type: "already_configured", path: toml });
                return;
            }

            const venvPython = await ensureModalInstalledOffline();

            const args = ["-m", "modal", "setup"];
            const profile = opts?.profile?.trim();
            if (profile) args.push("--profile", profile);

            await new Promise<void>((resolve, reject) => {
                const child = spawn(venvPython, args, {
                    env: process.env,
                    windowsHide: true,
                    stdio: ["ignore", "pipe", "pipe"],
                });

                let urlOpened = false;
                const forward = (prefix: string, buf: Buffer) => {
                    const text = String(buf);
                    for (const line of text.split(/\r?\n/)) {
                        if (!line.trim()) continue;
                        send({ type: "log", line: `${prefix}${line}` });
                    }

                    if (!urlOpened) {
                        const url = parseTokenFlowUrl(text);
                        if (url) {
                            urlOpened = true;
                            void shell.openExternal(url);
                            send({ type: "auth_url", url });
                        }
                    }
                };

                child.stdout?.on("data", (b: Buffer) => forward("", b));
                child.stderr?.on("data", (b: Buffer) => forward("[err] ", b));

                child.on("error", (e) => reject(e));
                child.on("exit", (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`modal setup failed (${code ?? "unknown"})`));
                });
            });

            if (!fs.existsSync(toml)) {
                throw new Error(
                    `Modal setup completed but config not found at ${toml}`,
                );
            }

            send({ type: "done", path: toml });
        } finally {
            modalSetupRunning = false;
        }
    },
);

